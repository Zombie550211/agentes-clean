const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const { getDb } = require('../config/db');

// Colección en MongoDB para persistencia
const COLLECTION = 'employees_of_month';

// GET - Obtener empleados del mes (público - todos pueden ver)
router.get('/', async (req, res) => {
  try {
    console.log('📋 Obteniendo empleados del mes (MongoDB)');
    const db = getDb();
    const docs = await db.collection(COLLECTION).find({}).toArray();
    const out = {};
    for (const d of docs) {
      out[d.employee] = {
        employee: d.employee,
        name: d.name,
        description: d.description,
        imageData: d.imageData,
        imageClass: d.imageClass,
        date: d.date,
        updatedBy: d.updatedBy,
        updatedAt: d.updatedAt
      };
    }
    return res.json(out);
  } catch (error) {
    console.error('Error obteniendo empleados del mes:', error);
    return res.status(500).json({ message: 'Error interno del servidor' });
  }
});

// POST - Guardar/actualizar empleado del mes (protegido)
router.post('/', protect, authorize('Administrador', 'Supervisor Team Lineas'), async (req, res) => {
  try {
    const { employee, name, description, imageData, imageClass, date } = req.body;
    console.log('💾 Guardando empleado del mes:', employee);
    if (!employee || !name || !imageData) {
      return res.status(400).json({ message: 'Datos incompletos' });
    }
    const db = getDb();
    const now = new Date();
    await db.collection(COLLECTION).updateOne(
      { employee },
      {
        $set: {
          employee,
          name,
          description: description || '',
          imageData,
          imageClass: imageClass || '',
          date: date || new Date().toLocaleDateString('es-ES'),
          updatedBy: req.user?.username || 'Sistema',
          updatedAt: now
        }
      },
      { upsert: true }
    );
    console.log('✅ Empleado guardado exitosamente:', employee);
    return res.json({ message: 'Empleado guardado correctamente', employee });
  } catch (error) {
    console.error('Error guardando empleado del mes:', error);
    return res.status(500).json({ message: 'Error interno del servidor' });
  }
});

// DELETE - Eliminar empleado del mes (protegido)
router.delete('/:employee', protect, authorize('Administrador', 'Supervisor Team Lineas'), async (req, res) => {
  try {
    const { employee } = req.params;
    console.log('🗑️ Eliminando empleado del mes:', employee);
    const db = getDb();
    const result = await db.collection(COLLECTION).deleteOne({ employee });
    if (result.deletedCount > 0) {
      console.log('✅ Empleado eliminado exitosamente:', employee);
      return res.json({ message: 'Empleado eliminado correctamente' });
    } else {
      return res.status(404).json({ message: 'Empleado no encontrado' });
    }
  } catch (error) {
    console.error('Error eliminando empleado del mes:', error);
    return res.status(500).json({ message: 'Error interno del servidor' });
  }
});

module.exports = router;
