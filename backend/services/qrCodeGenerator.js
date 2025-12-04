// services/qrCodeGenerator.js
const QRCode = require("qrcode");

async function generateQRCode(url) {
  try {
    console.log("🔗 Generating QR code for URL:", url);
    
    // Validate URL
    if (!url || !url.startsWith('http')) {
      console.warn("⚠️ Invalid URL for QR code:", url);
      throw new Error('Invalid URL for QR code');
    }

    // Generate QR code with better settings
    const qrDataUrl = await QRCode.toDataURL(url, {
      width: 300,
      margin: 2,
      color: {
        dark: '#000000', // Black dots
        light: '#FFFFFF' // White background
      },
      errorCorrectionLevel: 'M' // Medium error correction
    });

    console.log("✅ QR code generated successfully");
    console.log("📊 QR code data URL length:", qrDataUrl.length, "characters");
    
    return qrDataUrl;
    
  } catch (error) {
    console.error("❌ QR code generation error:", error.message);
    
    // Return a better fallback with the URL info
    return generateFallbackQR(url, error.message);
  }
}

function generateFallbackQR(url, errorMessage = '') {
  console.log("🔄 Generating fallback QR code...");
  
  // Shorten URL for display
  const shortUrl = url.length > 25 ? url.substring(0, 25) + '...' : url;
  
  const svg = `
    <svg width="300" height="300" xmlns="http://www.w3.org/2000/svg">
      <!-- Background -->
      <rect width="100%" height="100%" fill="#f8fafc"/>
      
      <!-- Border -->
      <rect x="10" y="10" width="280" height="280" fill="white" stroke="#e2e8f0" stroke-width="2" rx="12"/>
      
      <!-- QR Code Placeholder Pattern -->
      <g fill="#1e40af">
        <!-- Position markers -->
        <rect x="30" y="30" width="50" height="50" fill="#1e40af"/>
        <rect x="220" y="30" width="50" height="50" fill="#1e40af"/>
        <rect x="30" y="220" width="50" height="50" fill="#1e40af"/>
        
        <!-- Pattern dots -->
        <circle cx="150" cy="90" r="8" fill="#1e40af"/>
        <circle cx="90" cy="150" r="6" fill="#1e40af"/>
        <circle cx="210" cy="150" r="6" fill="#1e40af"/>
        <circle cx="150" cy="210" r="8" fill="#1e40af"/>
      </g>
      
      <!-- URL Display -->
      <text x="150" y="270" text-anchor="middle" font-family="Arial, sans-serif" font-size="10" fill="#64748b">
        ${shortUrl}
      </text>
      
      <!-- Error message (if any) -->
      ${errorMessage ? `
        <text x="150" y="285" text-anchor="middle" font-family="Arial" font-size="8" fill="#ef4444">
          Error: ${errorMessage}
        </text>
      ` : ''}
    </svg>
  `;
  
  const base64SVG = Buffer.from(svg).toString('base64');
  return `data:image/svg+xml;base64,${base64SVG}`;
}

module.exports = { generateQRCode };