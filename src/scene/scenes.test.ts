import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseScene } from "./schema";

const dir = join(__dirname, "../../scenes");
const files = readdirSync(dir).filter((f) => f.endsWith(".scene.json"));

describe("scenes/*.scene.json", () => {
  it("has at least one scene", () => expect(files.length).toBeGreaterThan(0));
  it.each(files)("%s is valid", (file) => {
    expect(() => parseScene(JSON.parse(readFileSync(join(dir, file), "utf8")), file)).not.toThrow();
  });
});
