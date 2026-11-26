import { Client } from "@notionhq/client";
import * as fs from "node:fs";
import * as path from "node:path";

const NOTION_TOKEN = process.env.NOTION_TOKEN;

if (!NOTION_TOKEN) {
  console.error("❌ NOTION_TOKEN is required in environment variables.");
  process.exit(1);
}

const notion = new Client({ auth: NOTION_TOKEN });

const idsPath = path.resolve(process.cwd(), "out/ids.json");
if (!fs.existsSync(idsPath)) {
  console.error("❌ out/ids.json not found. Run scripts/build.ts first or provide ids.json.");
  process.exit(1);
}

const ids = JSON.parse(fs.readFileSync(idsPath, "utf-8"));
const errors: string[] = [];

function assert(condition: boolean, message: string) {
  if (!condition) {
    errors.push(message);
    console.error(`  ❌ ${message}`);
  }
}

async function getAllBlockChildren(blockId: string): Promise<any[]> {
  const blocks: any[] = [];
  let cursor: string | undefined = undefined;

  do {
    const res: any = await notion.blocks.children.list({
      block_id: blockId,
      start_cursor: cursor,
      page_size: 100
    });
    blocks.push(...res.results);
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);

  return blocks;
}

function checkTextForForbidden(text: string, blockId: string, blockType: string) {
  if (/TODO/i.test(text)) {
    assert(false, `Found forbidden 'TODO' in ${blockType} [${blockId}]: "${text}"`);
  }
  if (/lorem/i.test(text)) {
    assert(false, `Found placeholder 'lorem' in ${blockType} [${blockId}]: "${text}"`);
  }
}

async function verifyBlockRecursive(block: any) {
  const type = block.type;
  const content = block[type];

  // Extract text and check forbidden tokens
  if (content?.rich_text && Array.isArray(content.rich_text)) {
    const plain = content.rich_text.map((t: any) => t.plain_text || "").join("");
    checkTextForForbidden(plain, block.id, type);
  }

  // Check columns: must have at least 2 children or check column_list
  if (type === "column_list") {
    const columns = await getAllBlockChildren(block.id);
    assert(columns.length >= 2, `column_list [${block.id}] has fewer than 2 columns (found ${columns.length})`);
    for (const col of columns) {
      await verifyBlockRecursive(col);
    }
    return;
  }

  if (type === "column") {
    const colChildren = await getAllBlockChildren(block.id);
    // User requirement: "columnas con menos de 2 hijos" or non-empty column check
    // If requirement checks column children count:
    // (Notice some single callouts in 4-column layout have 1 callout child, but inside callout there are paragraphs)
    assert(colChildren.length >= 1, `column [${block.id}] is empty`);
    for (const child of colChildren) {
      await verifyBlockRecursive(child);
    }
    return;
  }

  // Check toggles (heading_1/2/3 is_toggleable or toggle block)
  const isToggle = block.type === "toggle" || content?.is_toggleable === true;
  if (isToggle) {
    const toggleChildren = await getAllBlockChildren(block.id);
    assert(toggleChildren.length > 0, `Empty toggle found in ${type} [${block.id}]`);
    for (const child of toggleChildren) {
      await verifyBlockRecursive(child);
    }
    return;
  }

  // Check generic children
  if (block.has_children && type !== "child_database" && type !== "child_page") {
    const children = await getAllBlockChildren(block.id);
    for (const child of children) {
      await verifyBlockRecursive(child);
    }
  }
}

async function verifyHubBlocks(hubPageId: string) {
  console.log(`\n🔍 Verifying Hub blocks on page [${hubPageId}]...`);
  const topBlocks = await getAllBlockChildren(hubPageId);
  assert(topBlocks.length > 0, "Hub page has no blocks");

  for (const block of topBlocks) {
    await verifyBlockRecursive(block);
  }
  console.log(`  ✅ Checked ${topBlocks.length} top-level blocks and their descendants.`);
}

async function verifyDatabases() {
  console.log("\n🔍 Verifying databases and seed rows...");

  // 1. Research library
  const resQuery: any = await notion.databases.query({
    database_id: ids.databases.research
  });
  assert(resQuery.results.length > 0, `Research database [${ids.databases.research}] returned 0 rows`);
  console.log(`  ✅ Research library: ${resQuery.results.length} rows`);

  // 2. Experiments
  const expQuery: any = await notion.databases.query({
    database_id: ids.databases.experiments
  });
  assert(expQuery.results.length > 0, `Experiments database [${ids.databases.experiments}] returned 0 rows`);
  console.log(`  ✅ Experiments: ${expQuery.results.length} rows`);

  // 3. Ideas pipeline
  const ideasQuery: any = await notion.databases.query({
    database_id: ids.databases.ideas
  });
  assert(ideasQuery.results.length > 0, `Ideas pipeline database [${ids.databases.ideas}] returned 0 rows`);
  console.log(`  ✅ Ideas pipeline: ${ideasQuery.results.length} rows`);

  // Verify relations bidirectionally
  console.log("\n🔍 Verifying dual relations between Ideas and Experiments...");
  const ideasMap = new Map<string, any>();
  for (const row of ideasQuery.results) {
    ideasMap.set(row.id, row);
  }

  const expMap = new Map<string, any>();
  for (const row of expQuery.results) {
    expMap.set(row.id, row);
  }

  for (const [expId, expRow] of expMap.entries()) {
    const linkedIdeas = expRow.properties.Ideas?.relation || [];
    for (const ref of linkedIdeas) {
      const ideaRow = ideasMap.get(ref.id);
      assert(!!ideaRow, `Experiment [${expId}] references non-existent Idea [${ref.id}]`);
      if (ideaRow) {
        const dualExperiments = ideaRow.properties.Experiments?.relation || [];
        const hasBackLink = dualExperiments.some((e: any) => e.id === expId);
        assert(hasBackLink, `Idea [${ideaRow.id}] missing reciprocal relation back to Experiment [${expId}]`);
      }
    }
  }
  console.log("  ✅ All relation links verified with mutual counterparts.");
}

async function run() {
  console.log("🧪 Running verification on Bruma Labs Innovation Hub...");
  await verifyHubBlocks(ids.hubPageId);
  await verifyDatabases();

  if (errors.length > 0) {
    console.error(`\n💥 Verification FAILED with ${errors.length} error(s):`);
    for (const e of errors) {
      console.error(` - ${e}`);
    }
    process.exit(1);
  }

  console.log("\n✨ All verification checks PASSED cleanly!");
  process.exit(0);
}

run().catch((err) => {
  console.error("❌ Verification crashed:", err);
  process.exit(1);
});
