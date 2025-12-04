// services/nanobanana.js - UPDATED WITH CONTROLLED IMAGE ORDER
const fs = require("fs");
const path = require("path");
const { GoogleGenAI } = require("@google/genai");

// Gemini API configuration
const GEMINI_API_KEY = "AIzaSyD_5rA2HsKl_oAjiA6W6owl5mtTYlJKOoA";

// Enhanced prompt builder for multiple outfits with controlled order
function buildPromptForMultipleOutfits(outfitItems, totalImages) {
  const tops = outfitItems.filter(item => item.type === 'top');
  const bottoms = outfitItems.filter(item => item.type === 'bottom');
  const fullOutfits = outfitItems.filter(item => item.type === 'full');

  console.log("🎯 Building prompt for controlled order:", { 
    tops: tops.length, 
    bottoms: bottoms.length, 
    fullOutfits: fullOutfits.length,
    totalImages 
  });

  let prompt = `CRITICAL VIRTUAL TRY-ON INSTRUCTIONS - MUST FOLLOW EXACTLY:

IMAGES PROVIDED (IN ORDER):\n`;

  // List outfit images first in prompt 
  outfitItems.forEach((item, index) => {
    prompt += `- IMAGE ${index + 1}: ${item.name} (${item.type})\n`;
  });
  
  prompt += `- IMAGE ${totalImages}: PERSON for virtual try-on (FINAL IMAGE)\n\n`;

  if (fullOutfits.length > 0) {
    prompt += `TASK: Perform FULL OUTFIT replacement with ${fullOutfits[0].name}.

REQUIREMENTS: 
1. Use the PERSON'S BODY SHAPE, POSE, and PROPORTIONS from IMAGE ${totalImages} (FINAL IMAGE)
2. REMOVE ALL original clothing from IMAGE ${totalImages}
3. REPLACE with the COMPLETE OUTFIT from IMAGE 1
4. PRESERVE the background, face, body shape, pose, and lighting 100% identical from IMAGE ${totalImages}
5. Ensure NATURAL proportions, fabric texture, lighting, and shadows
6. The outfit should match IMAGE 1 exactly in style, color, and design
7. DO NOT alter the person's body, face, or background from IMAGE ${totalImages}`;
  }
  else if (tops.length > 0 && bottoms.length > 0) {
    prompt += `TASK: Perform COMPLETE OUTFIT replacement with ${tops[0].name} and ${bottoms[0].name}.

REQUIREMENTS:
1. Use the PERSON'S BODY SHAPE, POSE, and PROPORTIONS from IMAGE ${totalImages} (FINAL IMAGE)
2. REMOVE ALL original clothing from IMAGE ${totalImages}
3. REPLACE TOP with ${tops[0].name} from IMAGE 1
4. REPLACE BOTTOM with ${bottoms[0].name} from IMAGE 2
5. PRESERVE the background, face, body shape, pose, and lighting 100% identical from IMAGE ${totalImages}
6. Ensure the top and bottom fit together naturally
7. MAINTAIN realistic fabric texture, shadows, and proportions
8. DO NOT alter the person's body, face, or background from IMAGE ${totalImages}

FAILURE CONDITIONS:
- If any original clothing remains: FAIL
- If person's face/body changes from IMAGE ${totalImages}: FAIL
- If background changes from IMAGE ${totalImages}: FAIL`;
  }
  else if (tops.length > 0) {
    prompt += `TASK: Perform TOP-ONLY clothing replacement with ${tops[0].name}.

REQUIREMENTS:
1. Use the PERSON'S BODY SHAPE, POSE, and PROPORTIONS from IMAGE ${totalImages} (FINAL IMAGE)
2. KEEP the person's original pants/skirt/shorts EXACTLY as in IMAGE ${totalImages} - DO NOT MODIFY
3. REMOVE ONLY the top clothing (shirt/jacket/sweater/etc.) from IMAGE ${totalImages}
4. REPLACE with the EXACT top clothing shown in IMAGE 1
5. PRESERVE the background, face, body shape, pose, and lighting 100% identical from IMAGE ${totalImages}
6. Ensure the new top fits naturally with the original bottom clothing
7. MAINTAIN realistic fabric texture, shadows, and proportions
8. DO NOT modify or change the bottom clothing in any way`;
  }
  else if (bottoms.length > 0) {
    prompt += `TASK: Perform BOTTOM-ONLY clothing replacement with ${bottoms[0].name}.

REQUIREMENTS:
1. Use the PERSON'S BODY SHAPE, POSE, and PROPORTIONS from IMAGE ${totalImages} (FINAL IMAGE)
2. KEEP the person's original shirt/jacket/top EXACTLY as in IMAGE ${totalImages} - DO NOT MODIFY
3. REMOVE ONLY the pants/skirt/shorts from IMAGE ${totalImages}
4. REPLACE with the EXACT bottom clothing shown in IMAGE 1
5. PRESERVE the background, face, body shape, pose, and lighting 100% identical from IMAGE ${totalImages}
6. Ensure the new bottom fits naturally with the original top clothing
7. MAINTAIN realistic fabric texture, shadows, and proportions
8. DO NOT modify or change the top clothing in any way`;
  }
  else {
    prompt += `TASK: Use the clothing references to modify the person photo accordingly.
    
REQUIREMENTS:
1. Use the PERSON'S BODY SHAPE, POSE, and PROPORTIONS from IMAGE ${totalImages} (FINAL IMAGE)
2. Keep the person's identity, pose, and background completely unchanged from IMAGE ${totalImages}`;
  }

  console.log("📝 Generated prompt with controlled order:", prompt.substring(0, 200) + "...");
  return prompt;
}

async function callNanoBanana(imagePaths) {
  try {
    console.log("🔧 Starting Gemini with CONTROLLED IMAGE ORDER...");
    console.log("📋 Image order:", imagePaths.map((img, index) => `${index + 1}. ${img.type.toUpperCase()}: ${img.name}`));

    // Initialize the Google GenAI client
    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

    // Extract outfit items for prompt building
    const outfitItems = imagePaths.filter(img => img.type === 'outfit');
    const totalImages = imagePaths.length;

    // Build content array with CORRECT ORDER: outfits first, human last
    const contents = [
      {
        text: buildPromptForMultipleOutfits(outfitItems, totalImages)
      }
    ];

    // ADD OUTFIT IMAGES FIRST
    for (let i = 0; i < outfitItems.length; i++) {
      const item = outfitItems[i];
      
      console.log(`📁 Adding OUTFIT image ${i + 1}/${outfitItems.length}: ${item.name}`);
      
      if (fs.existsSync(item.path)) {
        const clothingPhotoBuffer = fs.readFileSync(item.path);
        const clothingPhotoBase64 = clothingPhotoBuffer.toString('base64');
        
        contents.push({
          inlineData: {
            mimeType: "image/jpeg", 
            data: clothingPhotoBase64
          }
        });
        
        console.log(`✅ Added OUTFIT image ${i + 1}: ${item.name}`);
      } else {
        console.warn(`❌ OUTFIT image not found: ${item.path}`);
        throw new Error(`Outfit image not found: ${item.name}`);
      }
    }

    // ADD HUMAN IMAGE LAST (so AI uses this shape/pose)
    const humanImage = imagePaths.find(img => img.type === 'human');
    if (humanImage && fs.existsSync(humanImage.path)) {
      console.log(`📸 Adding HUMAN image LAST: ${humanImage.path}`);
      
      const userPhotoBuffer = fs.readFileSync(humanImage.path);
      const userPhotoBase64 = userPhotoBuffer.toString('base64');
      
      contents.push({
        inlineData: {
          mimeType: "image/jpeg",
          data: userPhotoBase64
        }
      });
      
      console.log(`✅ Added HUMAN image LAST`);
    } else {
      throw new Error("Human photo not found");
    }

    console.log(`📸 Final image order sent to Gemini:`);
    console.log(`   1. PROMPT: ${contents[0].text.substring(0, 100)}...`);
    outfitItems.forEach((item, index) => {
      console.log(`   ${index + 2}. OUTFIT: ${item.name}`);
    });
    console.log(`   ${contents.length}. HUMAN: user_photo`);

    // Call the API with CORRECT IMAGE ORDER
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-image-preview",
      contents: contents
    });

    console.log("✅ Gemini response received");

    // Process the response
    if (response.candidates && response.candidates[0] && response.candidates[0].content && response.candidates[0].content.parts) {
      
      for (const part of response.candidates[0].content.parts) {
        if (part.text) {
          console.log("📝 Text part received:", part.text.substring(0, 200) + "...");
        } else if (part.inlineData) {
          const imageData = part.inlineData.data;
          const mimeType = part.inlineData.mimeType;
          
          console.log("🎨 Generated image received, mime type:", mimeType);
          console.log("📊 Generated image size:", imageData.length, "characters in base64");

          // Save the generated image
          const outputPath = path.join(__dirname, "../uploads/gemini25_image_result_" + Date.now() + ".png");
          const buffer = Buffer.from(imageData, "base64");
          fs.writeFileSync(outputPath, buffer);

          console.log("💾 Gemini generated image saved to:", outputPath);
          console.log("✅ SUCCESS: Image generation completed with controlled image order");
          return outputPath;
        }
      }

      const textParts = response.candidates[0].content.parts
        .filter(part => part.text)
        .map(part => part.text)
        .join(' ');
      
      console.log("📝 Only text response received:", textParts);
      throw new Error("Gemini returned text but no image data");

    } else {
      throw new Error("Unexpected response format from Gemini");
    }
// added catch and error error handling
  } catch (error) {
    console.error("❌ Error calling Gemini:", error.message);
    throw error;
  }
}

module.exports = { callNanoBanana, buildPromptForMultipleOutfits };



























