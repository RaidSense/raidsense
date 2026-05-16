import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

export const maxDuration = 60;

const DEFENSE_IDS = [
  "cannon", "archer-tower", "mortar", "air-defense", "wizard-tower",
  "x-bow", "inferno-tower", "eagle-artillery", "scattershot", "monolith",
  "bomb-tower", "hidden-tesla", "air-sweeper", "builder-hut",
];
const TRAP_IDS = [
  "bomb", "giant-bomb", "air-bomb", "spring-trap", "seeking-air-mine", "tornado-trap",
];
const BUILDING_IDS = [
  "town-hall", "clan-castle", "army-camp", "barracks", "dark-barracks",
  "laboratory", "spell-factory", "dark-spell-factory", "workshop",
  "hero-hall", "blacksmith", "pet-house",
  "gold-mine", "elixir-collector", "dark-elixir-drill",
  "gold-storage", "elixir-storage", "dark-elixir-storage",
];
const ALL_IDS = new Set([...DEFENSE_IDS, ...TRAP_IDS, ...BUILDING_IDS]);

const SYSTEM_PROMPT = `You are an expert Clash of Clans base analyst.

## YOUR TASK
Identify every building, trap, and wall tile in this screenshot.
For each one, output its CENTER position as a percentage of the image dimensions.

## OUTPUT FORMAT
- pixelX: percentage of image WIDTH  where the building CENTER appears (0 = left edge, 100 = right edge)
- pixelY: percentage of image HEIGHT where the building CENTER appears (0 = top edge, 100 = bottom edge)
- Do NOT estimate tile coordinates — output pixel percentages ONLY.
- The calibration step will convert pixel positions to tile coordinates.

## VALID BUILDING IDs (use EXACTLY these strings)
Defenses:  ${DEFENSE_IDS.join(", ")}
Traps:     ${TRAP_IDS.join(", ")} ← look carefully, they are small and on the ground
Buildings: ${BUILDING_IDS.join(", ")}

## METHODOLOGY
1. Identify the Town Hall first — it is the most elaborate building (ornate, often central).
2. Identify all defenses and structures visible in the image.
3. Look carefully for small traps (bomb, spring-trap, etc.) between buildings.
4. Identify wall tiles — they form ring/compartment shapes. Output each visible wall tile.
5. For every item, measure its center in % of image width and height.

## RULES
- Never invent IDs not in the list above.
- Include ALL buildings you can see, even if partially visible.
- For walls: output individual tile centers — each wall tile is a separate entry.
- If level is unclear, estimate from visual appearance (more ornate = higher).`;

export async function POST(req: Request) {
  try {
    const { image, mediaType } = await req.json() as {
      image:     string;
      mediaType: "image/png" | "image/jpeg" | "image/webp";
    };

    if (!image) return NextResponse.json({ error: "image is required" }, { status: 400 });

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "ANTHROPIC_API_KEY not set in environment" }, { status: 500 });

    const client = new Anthropic({ apiKey });

    const response = await client.messages.create({
      model:      "claude-opus-4-7",
      max_tokens: 8192,
      system:     SYSTEM_PROMPT,
      tools: [
        {
          name:        "report_base",
          description: "Report all buildings, traps, and walls with their pixel percentage positions.",
          input_schema: {
            type: "object",
            properties: {
              buildings: {
                type: "array",
                description: "All defenses, traps, and non-wall buildings.",
                items: {
                  type: "object",
                  properties: {
                    id:     { type: "string",  description: "Exact building ID." },
                    pixelX: { type: "number",  description: "Center X as % of image width (0–100)." },
                    pixelY: { type: "number",  description: "Center Y as % of image height (0–100)." },
                    level:  { type: "integer", description: "Estimated level (1–20)." },
                  },
                  required: ["id", "pixelX", "pixelY", "level"],
                },
              },
              walls: {
                type: "array",
                description: "Individual wall tile centers.",
                items: {
                  type: "object",
                  properties: {
                    pixelX: { type: "number", description: "Center X as % of image width (0–100)." },
                    pixelY: { type: "number", description: "Center Y as % of image height (0–100)." },
                  },
                  required: ["pixelX", "pixelY"],
                },
              },
            },
            required: ["buildings", "walls"],
          },
        },
      ],
      tool_choice: { type: "tool", name: "report_base" },
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: image } },
            { type: "text", text: "Identify every building, trap, and wall tile in this Clash of Clans screenshot. Output pixel percentage positions for each." },
          ],
        },
      ],
    });

    const toolBlock = response.content.find((b) => b.type === "tool_use");
    if (!toolBlock || toolBlock.type !== "tool_use") {
      return NextResponse.json({ error: "Claude did not return a tool call" }, { status: 500 });
    }

    const input = toolBlock.input as {
      buildings: { id: string; pixelX: number; pixelY: number; level: number }[];
      walls:     { pixelX: number; pixelY: number }[];
    };

    // Split buildings into defenses and neutral buildings, validate IDs
    const rawBuildings = (input.buildings ?? []).filter(b => ALL_IDS.has(b.id));
    const defenseSet   = new Set([...DEFENSE_IDS, ...TRAP_IDS]);
    const buildingSet  = new Set(BUILDING_IDS);

    const rawDefenses  = rawBuildings
      .filter(b => defenseSet.has(b.id))
      .map(b => ({ id: b.id, pixelX: clamp(b.pixelX), pixelY: clamp(b.pixelY), level: clampLv(b.level) }));

    const rawNeutral = rawBuildings
      .filter(b => buildingSet.has(b.id))
      .map(b => ({ id: b.id, pixelX: clamp(b.pixelX), pixelY: clamp(b.pixelY), level: clampLv(b.level) }));

    const rawWalls = (input.walls ?? []).map(w => ({
      pixelX: clamp(w.pixelX),
      pixelY: clamp(w.pixelY),
    }));

    return NextResponse.json({ rawDefenses, rawBuildings: rawNeutral, rawWalls });
  } catch (err) {
    console.error("[/api/recognize-base]", err);
    return NextResponse.json({ error: "Recognition failed" }, { status: 500 });
  }
}

function clamp(v: number)   { return Math.max(0, Math.min(100, Number(v) || 0)); }
function clampLv(v: number) { return Math.max(1, Math.min(20, Math.round(Number(v) || 1))); }
