const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');

// Simulamos una base de datos en memoria para los empleados del mes
// En producción, esto debería estar en MongoDB
let employeesOfMonth = {};

// GET - Obtener empleados del mes (público - todos pueden ver)
router.get('/', async (req, res) => {
  try {
    console.log('📋 Obteniendo empleados del mes (público)');
    res.json(employeesOfMonth);
  } catch (error) {
    console.error('Error obteniendo empleados del mes:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
});

// POST - Guardar/actualizar empleado del mes (temporal sin auth para testing)
router.post('/', async (req, res) => {
  try {
    const { employee, name, description, imageData, imageClass, date } = req.body;
    
    console.log('💾 Guardando empleado del mes:', employee);
    
    // Validar datos requeridos
    if (!employee || !name || !imageData) {
      return res.status(400).json({ message: 'Datos incompletos' });
    }
    
    // Guardar empleado
    employeesOfMonth[employee] = {
      employee,
      name,
      description,
      imageData,
      imageClass,
      date: date || new Date().toLocaleDateString('es-ES'),
      updatedBy: 'Sistema',
      updatedAt: new Date()
    };
    
    console.log('✅ Empleado guardado exitosamente:', employee);
    res.json({ message: 'Empleado guardado correctamente', employee });
    
  } catch (error) {
    console.error('Error guardando empleado del mes:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
});

// DELETE - Eliminar empleado del mes (temporal sin auth para testing)
router.delete('/:employee', async (req, res) => {
  try {
    const { employee } = req.params;
    
    console.log('🗑️ Eliminando empleado del mes:', employee);
    
    if (employeesOfMonth[employee]) {
      delete employeesOfMonth[employee];
      console.log('✅ Empleado eliminado exitosamente:', employee);
      res.json({ message: 'Empleado eliminado correctamente' });
    } else {
      res.status(404).json({ message: 'Empleado no encontrado' });
    }
    
  } catch (error) {
    console.error('Error eliminando empleado del mes:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
});

module.exports = router;
