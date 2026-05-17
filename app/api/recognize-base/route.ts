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

const SYSTEM_PROMPT = `You are an expert Clash of Clans base analyst working with isometric screenshots.

## PIXEL PERCENTAGE FORMAT
For every position report:
- pixelX: X as % of image width  (0 = left edge, 100 = right edge)
- pixelY: Y as % of image height (0 = top  edge, 100 = bottom edge)
Never estimate tile coordinates — always output pixel percentages.

## HOW TO FIND A BUILDING'S CENTER (critical for accuracy)
CoC uses ISOMETRIC 3D perspective. Buildings have height. Their true ground position
is LOWER in the image than their visual center.

Rule: place your cursor at the BOTTOM-CENTER of the building sprite — specifically
where the base/foundation meets the ground plane. This diamond-shaped ground area
is the tile footprint.
- Cannon (3×3): the center of the circular base at ground level
- Inferno Tower (2×2): center of the small square platform at ground
- Eagle Artillery (4×4): center of the large square base at ground
- Town Hall (4×4): center of the ornate base at ground (ignore the spire height)
- Walls: center of the small diamond tile at ground level

## VALID BUILDING IDs (use EXACTLY these strings)
Defenses: ${DEFENSE_IDS.join(", ")}
Traps:    ${TRAP_IDS.join(", ")}
Buildings:${BUILDING_IDS.join(", ")}

## BUILDING DETECTION STRATEGY
Work systematically — largest buildings first, then smaller:
1. Town Hall (largest, most elaborate, often center)
2. Eagle Artillery / Scattershot / Monolith (massive platforms)
3. X-Bow, Inferno Tower, Wizard Tower, Air Defense, Mortar, Cannon, Archer Tower
4. Bomb Tower, Hidden Tesla, Air Sweeper, Builder Hut
5. Clan Castle, Army Camp, Barracks (large neutral buildings)
6. Storage buildings, Laboratories, Factories
7. Traps (small, ground-level: bomb, spring-trap, giant-bomb, air-bomb, seeking-air-mine, tornado-trap)

## WALL DETECTION STRATEGY — OUTPUT RING CORNERS
Do NOT list every wall tile. Instead, identify each WALL RING as a sequence of CORNER POINTS.
A corner is a point where the wall changes direction (turning point of the ring).

For each ring:
- Most rings are rectangular → 4 corners
- L-shaped rings → 6 corners
- Complex rings → more corners
- Output corners in order (clockwise or counter-clockwise)
- Each corner pixelX/Y should point to the CENTER of the wall tile at that corner

Examples of corner detection:
- Find the top-most wall tile of a ring → that tile's center = top corner
- Find where the ring turns from going NE→NW → that tile = a corner
- Trace around the entire ring perimeter

## RULES
- Never invent IDs not in the list above
- Include ALL visible buildings, even partially visible ones
- If level is unclear: estimate from ornament complexity (more ornate = higher level)
- For Hidden Tesla: it may appear as a trapdoor/inactive — still report it`;

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
      model:      "claude-sonnet-4-6",
      max_tokens: 8000,
      system:     SYSTEM_PROMPT,
      tools: [
        {
          name:        "report_base",
          description: "Report all buildings, traps, and wall rings with their pixel percentage positions.",
          input_schema: {
            type: "object",
            properties: {
              buildings: {
                type: "array",
                description: "All defenses, traps, and non-wall buildings. Ground footprint center.",
                items: {
                  type: "object",
                  properties: {
                    id:     { type: "string",  description: "Exact building ID from the valid list." },
                    pixelX: { type: "number",  description: "Ground footprint center X as % of image width (0–100)." },
                    pixelY: { type: "number",  description: "Ground footprint center Y as % of image height (0–100). Should be at the BASE of the building, not its visual midpoint." },
                    level:  { type: "integer", description: "Estimated level (1–20)." },
                  },
                  required: ["id", "pixelX", "pixelY", "level"],
                },
              },
              wall_rings: {
                type: "array",
                description: "Each entry is ONE wall ring (compartment). Output the CORNER POINTS of each ring in order. A corner is where the wall changes direction.",
                items: {
                  type: "object",
                  properties: {
                    corners: {
                      type: "array",
                      description: "Corner points of this ring, in order. Each corner = center of the wall tile at that turning point.",
                      items: {
                        type: "object",
                        properties: {
                          pixelX: { type: "number", description: "Corner tile center X as % of image width (0–100)." },
                          pixelY: { type: "number", description: "Corner tile center Y as % of image height (0–100)." },
                        },
                        required: ["pixelX", "pixelY"],
                      },
                      minItems: 2,
                    },
                  },
                  required: ["corners"],
                },
              },
            },
            required: ["buildings", "wall_rings"],
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
              text: "Analyze this Clash of Clans base. Report every building and trap (ground footprint center), and every wall ring (corner points only, not individual tiles). Be systematic: largest buildings first, then traces each wall ring corner by corner.",
            },
          ],
        },
      ],
    });

    const toolBlock = response.content.find((b) => b.type === "tool_use");
    if (!toolBlock || toolBlock.type !== "tool_use") {
      const stopReason = response.stop_reason;
      return NextResponse.json(
        { error: `Reconnaissance échouée (stop: ${stopReason}) — réessaie` },
        { status: 500 },
      );
    }

    const input = toolBlock.input as {
      buildings:  { id: string; pixelX: number; pixelY: number; level: number }[];
      wall_rings: { corners: { pixelX: number; pixelY: number }[] }[];
    };

    const rawBuildings = (input.buildings ?? []).filter(b => ALL_IDS.has(b.id));
    const defenseSet   = new Set([...DEFENSE_IDS, ...TRAP_IDS]);
    const buildingSet  = new Set(BUILDING_IDS);

    const rawDefenses = rawBuildings
      .filter(b => defenseSet.has(b.id))
      .map(b => ({ id: b.id, pixelX: clamp(b.pixelX), pixelY: clamp(b.pixelY), level: clampLv(b.level) }));

    const rawNeutral = rawBuildings
      .filter(b => buildingSet.has(b.id))
      .map(b => ({ id: b.id, pixelX: clamp(b.pixelX), pixelY: clamp(b.pixelY), level: clampLv(b.level) }));

    const rawWallRings = (input.wall_rings ?? [])
      .filter(r => r.corners && r.corners.length >= 2)
      .map(r => ({
        corners: r.corners.map(c => ({
          pixelX: clamp(c.pixelX),
          pixelY: clamp(c.pixelY),
        })),
      }));

    return NextResponse.json({ rawDefenses, rawBuildings: rawNeutral, rawWallRings });
  } catch (err) {
    console.error("[/api/recognize-base]", err);
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    return NextResponse.json({ error: `Reconnaissance échouée : ${message}` }, { status: 500 });
  }
}

function clamp(v: number)   { return Math.max(0, Math.min(100, Number(v) || 0)); }
function clampLv(v: number) { return Math.max(1, Math.min(20, Math.round(Number(v) || 1))); }
