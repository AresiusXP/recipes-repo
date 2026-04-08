import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export interface GeminiRecipeResult {
  title: string;
  description: string;
  ingredients: string[];
  steps: string[];
  tags: string[];
}

/**
 * Sends page content to Gemini and requests structured recipe extraction.
 * Ingredients are converted to metric measurements.
 */
export async function extractRecipeWithGemini(
  pageContent: string,
  sourceUrl: string
): Promise<GeminiRecipeResult> {
  const model = genAI.getGenerativeModel({
    model: "gemini-2.0-flash",
    generationConfig: { responseMimeType: "application/json" },
  });

  const prompt = `You are a recipe extraction assistant. Extract the recipe from the following web page content and return a JSON object with this exact structure:

{
  "title": "Recipe title",
  "description": "A brief 1-2 sentence description of the dish",
  "ingredients": ["ingredient 1 with quantity in metric units", "ingredient 2", ...],
  "steps": ["Step 1 description", "Step 2 description", ...],
  "tags": ["tag1", "tag2", ...]
}

IMPORTANT RULES:
1. Convert ALL imperial measurements to metric (cups to ml, oz to g, lbs to kg, °F to °C, inches to cm, etc.)
2. Keep ingredient names and descriptions in the original language of the recipe
3. Tags should be lowercase, relevant food categories (e.g., "vegetarian", "dessert", "italian", "quick", "gluten-free")
4. Return ONLY valid JSON, no markdown code blocks, no explanation
5. If you cannot extract a recipe, return: {"error": "Could not extract recipe from this content"}

Source URL: ${sourceUrl}

Page content:
${pageContent.slice(0, 30000)}`;

  const result = await model.generateContent(prompt);
  const response = result.response;
  const text = response.text().trim();

  // Strip markdown code blocks if present
  const jsonStr = text.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "");

  const parsed = JSON.parse(jsonStr);

  if (parsed.error) {
    throw new Error(parsed.error);
  }

  return {
    title: parsed.title || "Untitled Recipe",
    description: parsed.description || "",
    ingredients: Array.isArray(parsed.ingredients) ? parsed.ingredients : [],
    steps: Array.isArray(parsed.steps) ? parsed.steps : [],
    tags: Array.isArray(parsed.tags)
      ? parsed.tags.map((t: string) => t.toLowerCase().trim())
      : [],
  };
}
