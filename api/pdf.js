// api/pdf.js - Vercel Serverless Function proxy para Google Drive PDFs
export default async function handler(req, res) {
  const { id } = req.query;

  if (!id) {
    return res.status(400).json({ error: 'Falta el parámetro id del archivo' });
  }

  try {
    // 1. URL directa de descarga de Google Drive
    const driveUrl = `https://drive.google.com/uc?export=download&id=${id}`;
    
    let response = await fetch(driveUrl);

    if (!response.ok) {
      return res.status(response.status).json({ error: 'No se pudo obtener el PDF desde Google Drive' });
    }

    const contentType = response.headers.get('content-type') || '';
    let arrayBuffer = await response.arrayBuffer();

    // 2. Si Google Drive devuelve HTML (advertencia de virus para archivos grandes), confirmamos la descarga
    if (contentType.includes('text/html')) {
      const htmlText = new TextDecoder().decode(arrayBuffer);
      // Extraer enlace de confirmación si existe
      const confirmMatch = htmlText.match(/href="(\/uc\?export=download[^"]+confirm=[^"]+)"/);
      let confirmUrl;

      if (confirmMatch) {
        confirmUrl = 'https://drive.google.com' + confirmMatch[1].replace(/&amp;/g, '&');
      } else {
        confirmUrl = `https://drive.google.com/uc?export=download&confirm=no_antivirus&id=${id}`;
      }

      const resConfirm = await fetch(confirmUrl);
      arrayBuffer = await resConfirm.arrayBuffer();
    }

    const buffer = Buffer.from(arrayBuffer);

    // 3. Servir el PDF binario con cabeceras CORS correctas
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400');
    return res.send(buffer);

  } catch (error) {
    console.error('Error proxy PDF:', error);
    return res.status(500).json({ error: 'Error procesando el PDF: ' + error.message });
  }
}
