import { Client } from "@notionhq/client";
import * as fs from "node:fs";
import * as path from "node:path";

const NOTION_TOKEN = process.env.NOTION_TOKEN;
const NOTION_PARENT_ID = process.env.NOTION_PARENT_ID;

if (!NOTION_TOKEN) {
  console.error("❌ NOTION_TOKEN is required in environment variables.");
  process.exit(1);
}

if (!NOTION_PARENT_ID) {
  console.error("❌ NOTION_PARENT_ID is required in environment variables.");
  process.exit(1);
}

const notion = new Client({ auth: NOTION_TOKEN });

function loadJson<T>(relativePath: string): T {
  const fullPath = path.resolve(process.cwd(), relativePath);
  const raw = fs.readFileSync(fullPath, "utf-8");
  return JSON.parse(raw);
}

async function run() {
  console.log("🧪 Building Bruma Labs Innovation Hub from code...\n");

  const hubSpec = loadJson<any>("spec/hub.json");
  const dbSpec = loadJson<any>("spec/databases.json");
  const seed = loadJson<any>("spec/seed.json");

  // 1. Create Hub Page
  console.log(`1/6 Creating Hub Page under parent [${NOTION_PARENT_ID}]...`);
  const page = await notion.pages.create({
    parent: { page_id: NOTION_PARENT_ID },
    icon: hubSpec.icon,
    cover: hubSpec.cover,
    properties: {
      title: {
        title: [{ type: "text", text: { content: hubSpec.title } }]
      }
    },
    children: hubSpec.blocks
  });

  const hubPageId = page.id;
  console.log(`   ✅ Hub Page created: ${hubPageId}`);

  // 2. Create Research Database (inline)
  console.log("2/6 Creating Research library database...");
  const researchDb = await notion.databases.create({
    parent: { type: "page_id", page_id: hubPageId },
    title: [{ type: "text", text: { content: dbSpec.research.title } }],
    description: [{ type: "text", text: { content: dbSpec.research.description } }],
    is_inline: true,
    properties: dbSpec.research.properties
  });
  console.log(`   ✅ Research library created: ${researchDb.id}`);

  // 3. Create Experiments Database (inline)
  console.log("3/6 Creating Experiments database...");
  const experimentsDb = await notion.databases.create({
    parent: { type: "page_id", page_id: hubPageId },
    title: [{ type: "text", text: { content: dbSpec.experiments.title } }],
    description: [{ type: "text", text: { content: dbSpec.experiments.description } }],
    is_inline: true,
    properties: dbSpec.experiments.properties
  });
  console.log(`   ✅ Experiments database created: ${experimentsDb.id}`);

  // 4. Create Ideas Pipeline Database (inline) with dual-property relation
  console.log("4/6 Creating Ideas pipeline database with relation to Experiments...");
  const ideasProperties: Record<string, any> = {
    ...dbSpec.ideas.properties,
    Experiments: {
      relation: {
        database_id: experimentsDb.id,
        type: "dual_property",
        dual_property: {
          synced_property_name: dbSpec.ideas.relations.Experiments.synced_property_name
        }
      }
    }
  };

  const ideasDb = await notion.databases.create({
    parent: { type: "page_id", page_id: hubPageId },
    title: [{ type: "text", text: { content: dbSpec.ideas.title } }],
    description: [{ type: "text", text: { content: dbSpec.ideas.description } }],
    is_inline: true,
    properties: ideasProperties
  });
  console.log(`   ✅ Ideas pipeline created: ${ideasDb.id}`);

  // 5. Update Ideas with Rollup and Formula Score
  console.log("5/6 Updating Ideas pipeline with Score formula and Experiment results rollup...");
  await notion.databases.update({
    database_id: ideasDb.id,
    properties: {
      "Experiment results": dbSpec.ideas.computed["Experiment results"],
      Score: dbSpec.ideas.computed.Score
    }
  });
  console.log("   ✅ Computed fields attached to Ideas pipeline");

  // 6. Seed initial rows
  console.log("6/6 Seeding initial rows...");

  // Seed Research
  for (const item of seed.research) {
    await notion.pages.create({
      parent: { database_id: researchDb.id },
      properties: {
        Title: { title: [{ type: "text", text: { content: item.Title } }] },
        Type: { select: { name: item.Type } },
        URL: { url: item.URL },
        Tags: { multi_select: item.Tags.map((t: string) => ({ name: t })) }
      }
    });
  }
  console.log(`   ✅ Seeded ${seed.research.length} research references`);

  // Seed Ideas
  const ideaIdMap = new Map<string, string>();
  for (const item of seed.ideas) {
    const createdIdea = await notion.pages.create({
      parent: { database_id: ideasDb.id },
      properties: {
        Idea: { title: [{ type: "text", text: { content: item.Idea } }] },
        Stage: { select: { name: item.Stage } },
        Impact: { select: { name: item.Impact } },
        Effort: { select: { name: item.Effort } },
        Tags: { multi_select: item.Tags.map((t: string) => ({ name: t })) }
      }
    });
    ideaIdMap.set(item.key, createdIdea.id);
  }
  console.log(`   ✅ Seeded ${seed.ideas.length} ideas`);

  // Seed Experiments and link to Ideas
  for (const item of seed.experiments) {
    const linkedIdeaId = ideaIdMap.get(item.ideaKey);
    const relationProp = linkedIdeaId ? [{ id: linkedIdeaId }] : [];

    await notion.pages.create({
      parent: { database_id: experimentsDb.id },
      properties: {
        Name: { title: [{ type: "text", text: { content: item.Name } }] },
        Hypothesis: {
          rich_text: [{ type: "text", text: { content: item.Hypothesis } }]
        },
        Status: { select: { name: item.Status } },
        Result: { select: { name: item.Result } },
        Start: { date: { start: item.Start } },
        End: { date: { start: item.End } },
        Learnings: {
          rich_text: [{ type: "text", text: { content: item.Learnings } }]
        },
        Ideas: { relation: relationProp }
      }
    });
  }
  console.log(`   ✅ Seeded ${seed.experiments.length} experiments and linked relations`);

  // Save generated IDs to out/ids.json
  const outDir = path.resolve(process.cwd(), "out");
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const idsData = {
    parentId: NOTION_PARENT_ID,
    hubPageId,
    databases: {
      research: researchDb.id,
      experiments: experimentsDb.id,
      ideas: ideasDb.id
    },
    createdAt: new Date().toISOString()
  };

  fs.writeFileSync(path.join(outDir, "ids.json"), JSON.stringify(idsData, null, 2));
  console.log("\n📦 Saved created IDs to out/ids.json");
  console.log("🎉 Innovation Hub built successfully!");
}

run().catch((err) => {
  console.error("❌ Build failed:", err);
  process.exit(1);
});
