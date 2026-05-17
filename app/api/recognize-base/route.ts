import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

export const maxDuration = 90;

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
Identify every building, trap, and wall segment in this screenshot.

## OUTPUT FORMAT (pixel percentages)
- pixelX: percentage of image WIDTH  (0 = left edge, 100 = right edge)
- pixelY: percentage of image HEIGHT (0 = top edge, 100 = bottom edge)
- Do NOT estimate tile coordinates — output pixel percentages ONLY.

## CRITICAL — WHERE TO MEASURE (buildings)
This is an ISOMETRIC (3D perspective) screenshot. Buildings have height and cast shadows.
You MUST report the center of the TILE FOOTPRINT at GROUND LEVEL, NOT the visual center of the 3D model.
- For a 3×3 building: report the center of the 3×3 tile square on the ground, not the top of the roof.
- The tile footprint is always a diamond-shaped area at the bottom of the building sprite.
- Typically the correct point is near the BOTTOM of the building's visual sprite (the base/foundation).

## VALID BUILDING IDs (use EXACTLY these strings)
Defenses:  ${DEFENSE_IDS.join(", ")}
Traps:     ${TRAP_IDS.join(", ")} ← look carefully, they are small and on the ground
Buildings: ${BUILDING_IDS.join(", ")}

## WALL METHODOLOGY — READ CAREFULLY
Walls form compartment rings. Instead of listing every tile individually, output WALL RUNS.
A wall run is a straight connected sequence of wall tiles going in ONE direction:
  • Direction A: tiles aligned along the NE–SW isometric axis (appears as ↘ diagonal on screen)
  • Direction B: tiles aligned along the NW–SE isometric axis (appears as ↙ diagonal on screen)

For each wall run, output:
  - startPixelX / startPixelY: center of the FIRST wall tile in the run
  - endPixelX   / endPixelY:   center of the LAST  wall tile in the run

IMPORTANT: Be EXHAUSTIVE. Scan every compartment ring systematically.
  1. Find each ring of walls (inner, outer, any sub-compartment).
  2. Trace each ring edge by edge — each straight edge = one wall run entry.
  3. Don't merge runs that change direction — split at every corner.
  4. A single isolated wall tile → startPixelX/Y = endPixelX/Y (same point).

## BUILDING METHODOLOGY
1. Identify the Town Hall first — most elaborate building, often central.
2. Identify all defenses and structures visible in the image.
3. Look carefully for small traps (bomb, spring-trap, etc.) between buildings.
4. For every item, measure the center of its GROUND FOOTPRINT.

## RULES
- Never invent building IDs not in the list above.
- Include ALL buildings you can see, even if partially visible.
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
      max_tokens: 16000,
      system:     SYSTEM_PROMPT,
      tools: [
        {
          name:        "report_base",
          description: "Report all buildings, traps, and wall runs with their pixel percentage positions.",
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
                    pixelX: { type: "number",  description: "Ground footprint center X as % of image width (0–100)." },
                    pixelY: { type: "number",  description: "Ground footprint center Y as % of image height (0–100)." },
                    level:  { type: "integer", description: "Estimated level (1–20)." },
                  },
                  required: ["id", "pixelX", "pixelY", "level"],
                },
              },
              wall_segments: {
                type: "array",
                description: "Wall runs. Each entry is ONE straight connected sequence of wall tiles (same isometric direction). Split at every corner. Be exhaustive — cover every ring.",
                items: {
                  type: "object",
                  properties: {
                    startPixelX: { type: "number", description: "First tile center X as % of image width (0–100)." },
                    startPixelY: { type: "number", description: "First tile center Y as % of image height (0–100)." },
                    endPixelX:   { type: "number", description: "Last tile center X as % of image width (0–100)." },
                    endPixelY:   { type: "number", description: "Last tile center Y as % of image height (0–100)." },
                  },
                  required: ["startPixelX", "startPixelY", "endPixelX", "endPixelY"],
                },
              },
            },
            required: ["buildings", "wall_segments"],
          },
        },
      ],
      tool_choice: { type: "tool", name: "report_base" },
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: image } },
            {
              type: "text",
              text: "Identify every building, trap, and wall run in this Clash of Clans screenshot. For walls, output RUNS (start + end of each straight segment). Be exhaustive — cover every wall ring completely.",
            },
          ],
        },
      ],
    });

    const toolBlock = response.content.find((b) => b.type === "tool_use");
    if (!toolBlock || toolBlock.type !== "tool_use") {
      return NextResponse.json({ error: "Claude did not return a tool call" }, { status: 500 });
    }

    const input = toolBlock.input as {
      buildings:     { id: string; pixelX: number; pixelY: number; level: number }[];
      wall_segments: { startPixelX: number; startPixelY: number; endPixelX: number; endPixelY: number }[];
    };

    // Split buildings into defenses and neutral buildings, validate IDs
    const rawBuildings = (input.buildings ?? []).filter(b => ALL_IDS.has(b.id));
    const defenseSet   = new Set([...DEFENSE_IDS, ...TRAP_IDS]);
    const buildingSet  = new Set(BUILDING_IDS);

    const rawDefenses = rawBuildings
      .filter(b => defenseSet.has(b.id))
      .map(b => ({ id: b.id, pixelX: clamp(b.pixelX), pixelY: clamp(b.pixelY), level: clampLv(b.level) }));

    const rawNeutral = rawBuildings
      .filter(b => buildingSet.has(b.id))
      .map(b => ({ id: b.id, pixelX: clamp(b.pixelX), pixelY: clamp(b.pixelY), level: clampLv(b.level) }));

    const rawWallSegments = (input.wall_segments ?? []).map(s => ({
      startPixelX: clamp(s.startPixelX),
      startPixelY: clamp(s.startPixelY),
      endPixelX:   clamp(s.endPixelX),
      endPixelY:   clamp(s.endPixelY),
    }));

    return NextResponse.json({ rawDefenses, rawBuildings: rawNeutral, rawWallSegments });
  } catch (err) {
    console.error("[/api/recognize-base]", err);
    return NextResponse.json({ error: "Recognition failed" }, { status: 500 });
  }
}

function clamp(v: number)   { return Math.max(0, Math.min(100, Number(v) || 0)); }
function clampLv(v: number) { return Math.max(1, Math.min(20, Math.round(Number(v) || 1))); }
