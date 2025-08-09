// Permitir peticiones https sin validar certificados (solo desarrollo)
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
console.log('server.js iniciado');
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { enviarCorreo } = require('./mailer');
const tasaRouter = require('./tasa');
const app = express();
const PORT = 3000;
app.use(cors());
app.use(express.json());
app.use('/api', tasaRouter);

// Estado de venta de boletos (persistente en archivo)
const estadoPath = path.join(__dirname, 'estado_rifa.json');
function setVentaActiva(activa) {
    fs.writeFileSync(estadoPath, JSON.stringify({ ventaActiva: !!activa }));
}
function getVentaActiva() {
    if (!fs.existsSync(estadoPath)) return true;
    try {
        return JSON.parse(fs.readFileSync(estadoPath, 'utf-8')).ventaActiva !== false;
    } catch { return true; }
}



app.use(cors());
app.use(express.json());

// Dummy endpoint para notificar liberación (puede usarse para websockets en el futuro)
app.post('/api/notificar-liberacion', (req, res) => {
    res.json({ ok: true });
});
// Endpoint para consultar si la venta está activa
app.get('/api/venta-activa', (req, res) => {
    res.json({ ventaActiva: getVentaActiva() });
});
// Endpoint para cerrar la venta
app.post('/api/cerrar-venta', (req, res) => {
    setVentaActiva(false);
    res.json({ mensaje: 'Venta de boletos cerrada.' });
});
// Endpoint para reiniciar la rifa (liberar todos los números y compras)
app.post('/api/reiniciar-rifa', (req, res) => {
    const pagosPath = path.join(__dirname, 'pagos.json');
    if (fs.existsSync(pagosPath)) fs.unlinkSync(pagosPath);
    setVentaActiva(true);
    res.json({ mensaje: 'Rifa reiniciada. Todos los números están disponibles.' });
});

// Ruta para obtener todas las compras de rifas
app.get('/api/compras', (req, res) => {
    const pagosPath = path.join(__dirname, 'pagos.json');
    if (!fs.existsSync(pagosPath)) return res.json([]);
    const lines = fs.readFileSync(pagosPath, 'utf-8').split('\n').filter(Boolean);
    const compras = [];
    for (const line of lines) {
        try {
            const compra = JSON.parse(line);
            compras.push(compra);
        } catch {}
    }
    res.json(compras);
});

// Configuración de almacenamiento para comprobantes
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, path.join(__dirname, 'uploads'));
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + '-' + file.originalname);
    }
});
const upload = multer({ storage: storage });

// Ruta para recibir pagos
// Ruta para obtener los números de rifa vendidos
app.get('/api/numeros-vendidos', (req, res) => {
    const pagosPath = path.join(__dirname, 'pagos.json');
    if (!fs.existsSync(pagosPath)) return res.json([]);
    const lines = fs.readFileSync(pagosPath, 'utf-8').split('\n').filter(Boolean);
    const vendidos = new Set();
    for (const line of lines) {
        try {
            const pago = JSON.parse(line);
            if (Array.isArray(pago.numerosSeleccionados)) {
                pago.numerosSeleccionados.forEach(n => vendidos.add(n));
            }
        } catch {}
    }
    res.json(Array.from(vendidos));
});

app.post('/api/pago', upload.single('comprobante'), (req, res) => {
    if (!getVentaActiva()) {
        return res.status(403).json({ error: 'La venta de boletos está cerrada. Espere la próxima rifa.' });
    }
    const { banco, telefono, cedula, numerosSeleccionados, titular, ubicacion, correo } = req.body;
    const comprobante = req.file;
    if (!banco || !telefono || !cedula || !comprobante || !numerosSeleccionados || !titular || !ubicacion || !correo) {
        return res.status(400).json({ error: 'Faltan datos, banco, comprobante, titular, ubicación, correo o números de rifa.' });
    }
    // Guardar registro en archivo (puedes migrar a base de datos luego)
    const registro = {
        banco,
        telefono,
        cedula,
        titular,
        ubicacion,
        correo,
        estado: 'pendiente',
        numerosSeleccionados: numerosSeleccionados.split(',').map(n => parseInt(n)),
        comprobante: comprobante.filename,
        fecha: new Date().toISOString()
    };
    fs.appendFileSync(path.join(__dirname, 'pagos.json'), JSON.stringify(registro) + '\n');
    res.json({ mensaje: '¡Tus números han sido apartados! Serán confirmados cuando se verifique el pago en la cuenta bancaria.' });
});

// Servir comprobantes (opcional, para administración)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Ruta para confirmar pago y enviar correo
app.post('/api/confirmar', async (req, res) => {
    const { id } = req.body;
    const pagosPath = path.join(__dirname, 'pagos.json');
    if (!fs.existsSync(pagosPath)) return res.status(404).json({ error: 'No hay compras registradas.' });
    let lines = fs.readFileSync(pagosPath, 'utf-8').split('\n').filter(Boolean);
    let actualizado = false;
    let compraConfirmada = null;
    lines = lines.map((line, idx) => {
        try {
            const compra = JSON.parse(line);
            if (idx === Number(id) && compra.estado !== 'confirmado') {
                compra.estado = 'confirmado';
                actualizado = true;
                compraConfirmada = compra;
                return JSON.stringify(compra);
            }
            return line;
        } catch { return line; }
    });
    if (!actualizado) return res.status(400).json({ error: 'No se pudo confirmar la compra.' });
    fs.writeFileSync(pagosPath, lines.join('\n') + '\n');
    // Enviar correo con estilo futurista
    if (compraConfirmada) {
        const html = `
        <div style="background:linear-gradient(135deg,#0f2027,#2c5364,#1a2980);color:#fff;font-family:'Orbitron',Arial,sans-serif;padding:30px 20px;border-radius:18px;max-width:500px;margin:auto;box-shadow:0 0 30px #00fff7,0 0 8px #1a2980;">
            <h2 style="color:#00fff7;text-shadow:0 0 8px #00fff7;">¡Pago Confirmado!</h2>
            <p>Hola <b>${compraConfirmada.titular}</b>,</p>
            <p>Tu pago ha sido verificado y tus números de rifa son:</p>
            <div style="background:rgba(0,255,247,0.10);border-radius:10px;padding:12px 0;margin:18px 0;font-size:1.2em;color:#00fff7;box-shadow:0 0 8px #00fff7 inset;">
                <b>${compraConfirmada.numerosSeleccionados.join(', ')}</b>
            </div>
            <p style="margin-top:18px;font-size:1.1em;">¡Mucha Suerte!!!</p>
            <p style="margin-top:30px;font-size:0.9em;color:#00fff7;">Gracias por participar en nuestra rifa futurista.</p>
        </div>
        `;
        try {
            await require('./mailer').enviarCorreo(
                compraConfirmada.correo,
                '¡Pago confirmado! Tus números de rifa',
                undefined,
                html
            );
        } catch (err) {
            return res.status(200).json({ mensaje: 'Confirmado, pero no se pudo enviar el correo.' });
        }
    }
    res.json({ mensaje: 'Pago confirmado y correo enviado.' });
});

// Ruta para liberar compra (eliminar registro)
app.post('/api/liberar', (req, res) => {
    const { id } = req.body;
    const pagosPath = path.join(__dirname, 'pagos.json');
    if (!fs.existsSync(pagosPath)) return res.status(404).json({ error: 'No hay compras registradas.' });
    let lines = fs.readFileSync(pagosPath, 'utf-8').split('\n').filter(Boolean);
    if (Number(id) < 0 || Number(id) >= lines.length) return res.status(400).json({ error: 'ID inválido.' });
    lines.splice(Number(id), 1);
    fs.writeFileSync(pagosPath, lines.join('\n') + (lines.length ? '\n' : ''));
    res.json({ mensaje: 'Compra liberada y números disponibles.' });
});

app.listen(PORT, () => {
    console.log(`Servidor backend escuchando en http://localhost:${PORT}`);
});
