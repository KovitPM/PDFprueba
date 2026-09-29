// api/pdf.js - Serverless function proxy para Google Drive PDFs de gran tamaño (70MB+)
import { Readable } from 'stream';

export default async function handler(req, res) {
  const { id } = req.query;

  if (!id) {
    return res.status(400).json({ error: 'Falta el parámetro id del archivo' });
  }

  try {
    // 1. URL de descarga con confirm=t para ignorar advertencia de virus en archivos grandes (>25MB)
    const driveUrl = `https://drive.google.com/uc?export=download&confirm=t&id=${id}`;
    
    let response = await fetch(driveUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: 'No se pudo obtener el PDF desde Google Drive' });
    }

    let contentType = response.headers.get('content-type') || '';

    // 2. Si Google Drive devuelve una página HTML de confirmación, extraemos la URL de descarga directa
    if (contentType.includes('text/html')) {
      const htmlText = await response.text();
      const confirmMatch = htmlText.match(/href="(\/uc\?export=download[^"]+confirm=[^"]+)"/);
      let confirmUrl;

      if (confirmMatch) {
        confirmUrl = 'https://drive.google.com' + confirmMatch[1].replace(/&amp;/g, '&');
      } else {
        confirmUrl = `https://drive.google.com/uc?export=download&confirm=t&id=${id}`;
      }

      response = await fetch(confirmUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
    }

    // 3. Establecer cabeceras necesarias para PDF y CORS
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400');

    // 4. Transmitir el flujo de datos binarios (Stream) al cliente para soportar archivos de 70MB+ sin agotar la memoria
    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body);
      return nodeStream.pipe(res);
    } else {
      const arrayBuffer = await response.arrayBuffer();
      return res.send(Buffer.from(arrayBuffer));
    }

  } catch (error) {
    console.error('Error proxy PDF:', error);
    return res.status(500).json({ error: 'Error procesando el PDF: ' + error.message });
  }
}
