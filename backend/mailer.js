const nodemailer = require('nodemailer');

// Configura aquí tu correo y contraseña de aplicación de Gmail
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'pruebadeautomatizacion22@gmail.com', // <-- Cambia esto
        pass: 'daqt cryo vsdg bzkl' // <-- Cambia esto
    }
});

async function enviarCorreo(destinatario, asunto, texto, html) {
    const mailOptions = {
        from: 'pruebadeautomatizacion22@gmail.com', // <-- Cambia esto
        to: destinatario,
        subject: asunto,
        text: texto,
        html: html
    };
    return transporter.sendMail(mailOptions);
}

module.exports = { enviarCorreo };
