import { GoogleGenerativeAI } from "@google/generative-ai";
import { logger, serializeError } from "@/lib/logger";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";

/** Supported target languages for extraction and translation. */
export type TargetLanguage = "en" | "nl" | "es";

export interface GeminiRecipeResult {
  title: string;
  description: string;
  ingredients: string[];
  steps: string[];
  tags: string[];
  detectedLanguage: string;
}

interface ExtractRecipeOptions {
  /** When provided, output will be translated into this language. When null/undefined, keeps the original language. */
  targetLanguage?: TargetLanguage | null;
}

const LANGUAGE_NAMES: Record<TargetLanguage, string> = {
  en: "English",
  nl: "Dutch",
  es: "Spanish",
};

/**
 * Sends page content to Gemini and requests structured recipe extraction.
 * Ingredients are converted to metric measurements.
 * When targetLanguage is provided, output is translated into that language.
 * When targetLanguage is null/undefined, content is kept in the original language.
 * Tags are always returned in English regardless of the option.
 */
export async function extractRecipeWithGemini(
  pageContent: string,
  sourceUrl: string,
  options: ExtractRecipeOptions = {}
): Promise<GeminiRecipeResult> {
  const log = logger.child({ component: "gemini", operation: "extractRecipe", model: GEMINI_MODEL });

  log.debug(
    { sourceUrl, contentLength: pageContent.length, targetLanguage: options.targetLanguage ?? null },
    "Calling Gemini for recipe extraction"
  );

  const model = genAI.getGenerativeModel({
    model: GEMINI_MODEL,
    generationConfig: { responseMimeType: "application/json" },
  });

  const translationRule = options.targetLanguage
    ? `2. ALL output (title, description, ingredient names, step descriptions) MUST be in ${LANGUAGE_NAMES[options.targetLanguage]}. Translate everything from the original language into ${LANGUAGE_NAMES[options.targetLanguage]}. Tags MUST always be in English regardless of the target language.`
    : "2. Keep the title, description, ingredient names, and step descriptions in their ORIGINAL language. Do NOT translate them. However, tags MUST always be in English regardless of the original language.";

  const prompt = `You are a recipe extraction assistant. Extract the recipe from the following web page content and return a JSON object with this exact structure:

{
  "title": "Recipe title",
  "description": "A brief 1-2 sentence description of the dish",
  "ingredients": ["ingredient 1 with quantity in metric units", "ingredient 2", ...],
  "steps": ["Step 1 description", "Step 2 description", ...],
  "tags": ["tag1", "tag2", ...],
  "detectedLanguage": "ISO 639-1 language code of the original recipe content (e.g. en, es, fr, de, it, ja, zh, ko, pt, etc.)"
}

IMPORTANT RULES:
1. Convert ALL imperial measurements to metric (cups to ml, oz to g, lbs to kg, °F to °C, inches to cm, etc.)
${translationRule}
3. Tags should be lowercase, relevant food categories (e.g., "vegetarian", "dessert", "italian", "quick", "gluten-free")
4. Return ONLY valid JSON, no markdown code blocks, no explanation
5. If you cannot extract a recipe, return: {"error": "Could not extract recipe from this content"}
6. The "detectedLanguage" field must reflect the language of the ORIGINAL content before any translation, using an ISO 639-1 two-letter code

Source URL: ${sourceUrl}

Page content:
${pageContent.slice(0, 30000)}`;

  try {
    const result = await model.generateContent(prompt);
    const response = result.response;
    const text = response.text().trim();

    // Strip markdown code blocks if present
    const jsonStr = text.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "");

    const parsed = JSON.parse(jsonStr);

    if (parsed.error) {
      log.warn({ sourceUrl, geminiError: parsed.error }, "Gemini reported it could not extract a recipe");
      throw new Error(parsed.error);
    }

    const extracted: GeminiRecipeResult = {
      title: parsed.title || "Untitled Recipe",
      description: parsed.description || "",
      ingredients: Array.isArray(parsed.ingredients) ? parsed.ingredients : [],
      steps: Array.isArray(parsed.steps) ? parsed.steps : [],
      tags: Array.isArray(parsed.tags)
        ? parsed.tags.map((t: string) => t.toLowerCase().trim())
        : [],
      detectedLanguage: typeof parsed.detectedLanguage === "string"
        ? parsed.detectedLanguage.toLowerCase().trim().slice(0, 2)
        : "en",
    };

    log.info(
      {
        sourceUrl,
        detectedLanguage: extracted.detectedLanguage,
        ingredientCount: extracted.ingredients.length,
        stepCount: extracted.steps.length,
        tagCount: extracted.tags.length,
      },
      "Gemini recipe extraction succeeded"
    );

    return extracted;
  } catch (error) {
    // Only log as error if it's not the expected "could not extract" case (already warned above)
    if (!(error instanceof Error && error.message.startsWith("Could not extract"))) {
      log.error({ sourceUrl, err: serializeError(error) }, "Gemini recipe extraction failed unexpectedly");
    }
    throw error;
  }
}

/**
 * Translates an existing recipe's content into the specified target language using Gemini.
 * Tags are kept as-is since they are already in English.
 */
export async function translateRecipeWithGemini(
  recipe: {
    title: string;
    description: string;
    ingredients: string[];
    steps: string[];
  },
  targetLanguage: TargetLanguage
): Promise<{
  title: string;
  description: string;
  ingredients: string[];
  steps: string[];
}> {
  const log = logger.child({ component: "gemini", operation: "translateRecipe", model: GEMINI_MODEL });

  log.debug(
    { ingredientCount: recipe.ingredients.length, stepCount: recipe.steps.length, targetLanguage },
    "Calling Gemini for recipe translation"
  );

  const model = genAI.getGenerativeModel({
    model: GEMINI_MODEL,
    generationConfig: { responseMimeType: "application/json" },
  });

  const targetName = LANGUAGE_NAMES[targetLanguage];

  const prompt = `You are a recipe translation assistant. Translate the following recipe content into ${targetName}. Return a JSON object with this exact structure:

{
  "title": "Translated title",
  "description": "Translated description",
  "ingredients": ["translated ingredient 1", "translated ingredient 2", ...],
  "steps": ["Translated step 1", "Translated step 2", ...]
}

IMPORTANT RULES:
1. Translate ALL text into ${targetName}
2. Keep metric measurements as they are (do not convert back to imperial)
3. Preserve the same number of ingredients and steps
4. Return ONLY valid JSON, no markdown code blocks, no explanation

Recipe content to translate:
${JSON.stringify({
    title: recipe.title,
    description: recipe.description,
    ingredients: recipe.ingredients,
    steps: recipe.steps,
  })}`;

  try {
    const result = await model.generateContent(prompt);
    const response = result.response;
    const text = response.text().trim();

    const jsonStr = text.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "");

    const parsed = JSON.parse(jsonStr);

    const translated = {
      title: parsed.title ?? recipe.title,
      description: parsed.description ?? recipe.description,
      ingredients: Array.isArray(parsed.ingredients) ? parsed.ingredients : recipe.ingredients,
      steps: Array.isArray(parsed.steps) ? parsed.steps : recipe.steps,
    };

    log.info(
      { ingredientCount: translated.ingredients.length, stepCount: translated.steps.length, targetLanguage },
      "Gemini recipe translation succeeded"
    );

    return translated;
  } catch (error) {
    log.error({ err: serializeError(error) }, "Gemini recipe translation failed");
    throw error;
  }
}
