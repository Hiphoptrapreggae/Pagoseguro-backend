console.log('tasa.js cargado');
const express = require('express');
const axios = require('axios');
const router = express.Router();

// Endpoint para obtener la tasa BCV actual
const fs = require('fs');
const path = require('path');
const { enviarCorreo } = require('./mailer');
const TASA_PATH = path.join(__dirname, 'tasa_manual.json');

// Endpoint para obtener la tasa BCV actual (primero manual, si no, web)
router.get('/tasa-bcv', async (req, res) => {
    // Si hay tasa manual, usarla
    if (fs.existsSync(TASA_PATH)) {
        try {
            const data = JSON.parse(fs.readFileSync(TASA_PATH, 'utf-8'));
            if (data && data.tasa) return res.json({ tasaBCV: data.tasa, manual: true });
        } catch {}
    }
    try {
        const https = require('https');
        const agent = new https.Agent({ rejectUnauthorized: false });
        const response = await axios.get('https://www.bcv.org.ve/', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
            },
            httpsAgent: agent
        });
        const match = response.data.match(/<div id="dolar"[\s\S]*?<strong>\s*([\d,.]+)\s*<\/strong>/i);
        if (match && match[1]) {
            const tasa = parseFloat(match[1].replace(',', '.'));
            return res.json({ tasaBCV: tasa });
        }
        res.status(500).json({ error: 'No se pudo extraer la tasa BCV.' });
    } catch (err) {
        console.log('Error al obtener la tasa BCV:', err);
        // Notificar por correo si falla
        enviarCorreo('pruebadeautomatizacion22@gmail.com', 'Error al actualizar tasa BCV', 'No se pudo obtener la tasa BCV automáticamente. Debe ingresar manualmente la tasa en el panel de administración.\n\nError: ' + err.toString());
        res.status(500).json({ error: 'Error al obtener la tasa BCV.' });
    }
});

// Endpoint para modificar la tasa manualmente (solo admin)
router.post('/tasa-bcv', (req, res) => {
    const { tasa } = req.body;
    if (!tasa || isNaN(tasa)) return res.status(400).json({ error: 'Tasa inválida' });
    fs.writeFileSync(TASA_PATH, JSON.stringify({ tasa: parseFloat(tasa) }));
    res.json({ mensaje: 'Tasa BCV manual actualizada', tasa: parseFloat(tasa) });
});

module.exports = router;
