#!/usr/bin/env node
/**
 * Backfill de agenteId a partir de agenteNombre en la colección costumers
 * 
 * Modo de uso:
 *   - Dry run (recomendado primero):
 *       node scripts/backfill_agenteId_from_nombre.js --dry-run
 *   - Commit (aplica cambios):
 *       node scripts/backfill_agenteId_from_nombre.js --commit
 */

const { ObjectId } = require('mongodb');
const { connectToMongoDB, getDb, closeConnection } = require('../config/db');

function parseArgs() {
  const args = process.argv.slice(2);
  return {
    commit: args.includes('--commit'),
    dryRun: args.includes('--dry-run') || !args.includes('--commit'),
    limit: (() => {
      const i = args.findIndex(a => a === '--limit');
      if (i >= 0 && args[i+1]) {
        const n = parseInt(args[i+1], 10);
        return Number.isFinite(n) && n > 0 ? n : null;
      }
      return null;
    })()
  };
}

function normalizeName(s) {
  return (s || '').toString().replace(/\s+/g, ' ').trim();
}

async function main() {
  const { dryRun, commit, limit } = parseArgs();
  console.log(`[BACKFILL] Iniciando backfill agenteId desde agenteNombre | dryRun=${dryRun} commit=${commit} limit=${limit ?? 'N/A'}`);

  try {
    const db = await connectToMongoDB();
    const costumers = db.collection('costumers');
    const users = db.collection('users');

    // Buscar candidatos: documentos con agenteNombre no vacío y agenteId vacío o ausente
    const match = {
      $and: [
        { $or: [
          { agenteId: { $exists: false } },
          { agenteId: null },
          { agenteId: '' }
        ]},
        { $or: [
          { agenteNombre: { $type: 'string', $ne: '' } },
          { agente: { $type: 'string', $ne: '' } },
          { agentName: { $type: 'string', $ne: '' } },
          { agent: { $type: 'string', $ne: '' } }
        ]}
      ]
    };

    const projection = { projection: { _id: 1, agenteNombre: 1, agente: 1, agentName: 1, agent: 1 } };
    const cursor = costumers.find(match, projection).limit(limit ?? 0);

    let scanned = 0;
    let resolved = 0;
    let updated = 0;
    let notFound = 0;

    while (await cursor.hasNext()) {
      const doc = await cursor.next();
      scanned++;

      const nameRaw = doc.agenteNombre || doc.agente || doc.agentName || doc.agent || '';
      const name = normalizeName(nameRaw);
      if (!name) { notFound++; continue; }

      // Buscar usuario por username que coincida con el nombre (case-insensitive)
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const user = await users.findOne({ username: { $regex: new RegExp(`^${escaped}$`, 'i') } });

      if (!user) {
        console.log(`[NO_MATCH] costumer=${doc._id} agenteNombre='${nameRaw}' -> usuario no encontrado por username`);
        notFound++;
        continue;
      }

      resolved++;
      const updates = {
        // Guardar ambas variantes para máxima compatibilidad
        agenteId: user._id.toString(),
        agentId: user._id,
      };

      console.log(`[MATCH] costumer=${doc._id} '${name}' -> user.username='${user.username}' _id=${user._id}`);
      if (dryRun) {
        continue;
      }

      const res = await costumers.updateOne({ _id: doc._id }, { $set: updates });
      if (res && res.modifiedCount > 0) updated++;
    }

    console.log('[BACKFILL] Resumen');
    console.log('  Escaneados:', scanned);
    console.log('  Resueltos (usuario encontrado):', resolved);
    console.log('  Actualizados:', updated);
    console.log('  Sin usuario:', notFound);
    console.log('  Modo:', dryRun ? 'DRY-RUN' : 'COMMIT');
  } catch (err) {
    console.error('[BACKFILL] Error:', err && err.message ? err.message : err);
    process.exitCode = 1;
  } finally {
    try { await closeConnection(); } catch {}
  }
}

main();
