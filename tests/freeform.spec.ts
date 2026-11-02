import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}
interface TablePiece extends Rect {
  index: number;
  placed: boolean;
}
interface Layout {
  board: Rect;
  tray: Rect;
  slots: (Rect & { index: number })[];
  tablePieces: TablePiece[];
}
interface Point {
  x: number;
  y: number;
}

async function layoutOf(page: Page): Promise<Layout> {
  await expect(page.locator(".puzzle-canvas")).toHaveAttribute(
    "data-layout",
    /"board"/,
  );
  return page
    .locator(".puzzle-canvas")
    .evaluate((el) => JSON.parse(el.getAttribute("data-layout")!) as Layout);
}
async function start(
  page: Page,
  difficulty: "easy" | "medium" = "easy",
  art = "wave",
) {
  await page.goto(`/solo?art=${art}`);
  if (difficulty === "medium")
    await page.getByRole("button", { name: /Settle in/ }).click();
  await page.getByRole("button", { name: "Find the first piece" }).click();
  await expect(page.locator(".puzzle-canvas canvas")).toBeVisible();
  await expect
    .poll(async () => (await layoutOf(page)).slots.length)
    .toBeGreaterThan(0);
}
async function savedPositions(page: Page): Promise<Record<string, Point>> {
  return page.evaluate(() => {
    const { seed } = JSON.parse(localStorage.getItem("pt-solo-session")!);
    return JSON.parse(
      localStorage.getItem(`pt-solo-${seed}:positions`) || "{}",
    );
  });
}
async function drag(page: Page, source: Point, target: Point) {
  const canvas = page.locator(".puzzle-canvas canvas");
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + source.x, box.y + source.y);
  await page.mouse.down();
  await page.mouse.move(box.x + target.x, box.y + target.y, { steps: 20 });
  await page.mouse.up();
}
const center = (rect: Rect): Point => ({
  x: rect.x + rect.width / 2,
  y: rect.y + rect.height / 2,
});
function destination(
  board: Rect,
  x: number,
  y: number,
  columns = 4,
  rows = 3,
): Point {
  return {
    x: board.x + (x + 1 / (2 * columns)) * board.width,
    y: board.y + (y + 1 / (2 * rows)) * board.height,
  };
}
async function expectLoose(page: Page, index: number, x: number, y: number) {
  await expect
    .poll(async () => {
      const position = (await savedPositions(page))[index];
      return (
        !!position &&
        Math.abs(position.x - x) < 0.015 &&
        Math.abs(position.y - y) < 0.015
      );
    })
    .toBe(true);
  const piece = (await layoutOf(page)).tablePieces.find(
    (p) => p.index === index,
  );
  expect(piece, "Loose piece is rendered on the board").toBeDefined();
  expect(piece!.placed).toBe(false);
}
async function expectWholeTableInView(page: Page) {
  await expect
    .poll(
      async () => {
        const box = await page.locator(".puzzle-canvas").boundingBox();
        return (
          !!box &&
          box.y >= 0 &&
          box.y + box.height <= (page.viewportSize()?.height || 0) + 1
        );
      },
      { message: "Both board and piece tray fit in the current viewport" },
    )
    .toBe(true);
  const layout = await layoutOf(page);
  const box = (await page.locator(".puzzle-canvas").boundingBox())!;
  for (const [name, rect] of Object.entries({
    board: layout.board,
    tray: layout.tray,
  })) {
    expect(rect.width, `${name} has positive width`).toBeGreaterThan(0);
    expect(rect.height, `${name} has positive height`).toBeGreaterThan(0);
    expect(rect.x).toBeGreaterThanOrEqual(-1);
    expect(rect.y).toBeGreaterThanOrEqual(-1);
    expect(rect.x + rect.width).toBeLessThanOrEqual(box.width + 1);
    expect(rect.y + rect.height).toBeLessThanOrEqual(box.height + 1);
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
    "No horizontal page overflow",
  ).toBe(true);
}

test("loose pieces stay where dropped, survive refresh, move again, return to the tray, then snap correctly", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await start(page);
  let layout = await layoutOf(page);
  const slot = layout.slots[0];
  const index = slot.index;
  await drag(page, center(slot), destination(layout.board, 0.13, 0.16));
  await expectLoose(page, index, 0.13, 0.16);
  await expect(page.locator(".puzzle-toolbar")).toContainText(
    "0 of 12 pieces in place",
  );
  await page.reload();
  await page.getByRole("button", { name: "Continue your puzzle" }).click();
  await expectLoose(page, index, 0.13, 0.16);
  layout = await layoutOf(page);
  let piece = layout.tablePieces.find((p) => p.index === index)!;
  await drag(page, center(piece), destination(layout.board, 0.61, 0.14));
  await expectLoose(page, index, 0.61, 0.14);
  layout = await layoutOf(page);
  piece = layout.tablePieces.find((p) => p.index === index)!;
  await drag(page, center(piece), center(layout.tray));
  await expect
    .poll(async () =>
      (await layoutOf(page)).tablePieces.some((p) => p.index === index),
    )
    .toBe(false);
  layout = await layoutOf(page);
  const returned = layout.slots.find((p) => p.index === index);
  expect(returned, "Returned piece is available in the tray").toBeDefined();
  await drag(
    page,
    center(returned!),
    destination(layout.board, (index % 4) / 4, Math.floor(index / 4) / 3),
  );
  await expect(page.locator(".puzzle-toolbar")).toContainText(
    "1 of 12 pieces in place",
  );
  expect(
    (await layoutOf(page)).tablePieces.find((p) => p.index === index)?.placed,
  ).toBe(true);
});

test("a loose board piece stays visible when browsing more pieces; reference does not move the table", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await start(page, "medium");
  let layout = await layoutOf(page);
  const slot = layout.slots[0];
  await drag(page, center(slot), destination(layout.board, 0.19, 0.25, 8, 6));
  await expectLoose(page, slot.index, 0.19, 0.25);
  await page.getByRole("button", { name: "Next pieces" }).click();
  await expectLoose(page, slot.index, 0.19, 0.25);
  const before = (await page.locator(".puzzle-canvas").boundingBox())!;
  await page
    .getByRole("button", { name: "Show reference", exact: true })
    .click();
  const after = (await page.locator(".puzzle-canvas").boundingBox())!;
  expect(Math.abs(after.y - before.y)).toBeLessThan(1);
  expect(Math.abs(after.height - before.height)).toBeLessThan(1);
  await expectWholeTableInView(page);
  await page
    .getByRole("button", { name: "Hide reference", exact: true })
    .click();
  layout = await layoutOf(page);
  const piece = layout.tablePieces.find((p) => p.index === slot.index)!;
  await drag(
    page,
    center(piece),
    destination(
      layout.board,
      (slot.index % 8) / 8,
      Math.floor(slot.index / 8) / 6,
      8,
      6,
    ),
  );
  await expect(page.locator(".puzzle-toolbar")).toContainText(
    "1 of 48 pieces in place",
  );
});

for (const viewport of [
  { width: 1366, height: 768 },
  { width: 1920, height: 1080 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 390, height: 844 },
  { width: 320, height: 568 },
  { width: 844, height: 390 },
]) {
  test(`board and tray are visible together at ${viewport.width}×${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await start(
      page,
      "medium",
      viewport.width === 768 ? "self-portrait" : "night-cafe",
    );
    await expectWholeTableInView(page);
    if (viewport.width === 1366)
      await page.screenshot({ path: "/tmp/puzzletogether-new-desktop.png" });
    if (viewport.width === 390)
      await page.screenshot({ path: "/tmp/puzzletogether-new-mobile.png" });
    if (viewport.width === 844) {
      await page.setViewportSize({ width: 390, height: 844 });
      await expectWholeTableInView(page);
    }
  });
}

test("touch dragging places an unfinished piece without scrolling the phone page", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  try {
    await start(page);
    await expectWholeTableInView(page);
    const layout = await layoutOf(page);
    const slot = layout.slots[0];
    const box = (await page.locator(".puzzle-canvas canvas").boundingBox())!;
    const from = center(slot),
      to = destination(layout.board, 0.13, 0.16);
    const scroll = await page.evaluate(() => scrollY);
    const cdp = await context.newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: box.x + from.x, y: box.y + from.y, id: 1 }],
    });
    for (let step = 1; step <= 15; step++)
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [
          {
            x: box.x + from.x + ((to.x - from.x) * step) / 15,
            y: box.y + from.y + ((to.y - from.y) * step) / 15,
            id: 1,
          },
        ],
      });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await expectLoose(page, slot.index, 0.13, 0.16);
    expect(await page.evaluate(() => scrollY)).toBe(scroll);
    await cdp.detach();
  } finally {
    await context.close();
  }
});

test("existing completed-piece saves remain usable after the layout update", async ({
  page,
}) => {
  await start(page);
  await page.evaluate(() => {
    const { seed } = JSON.parse(localStorage.getItem("pt-solo-session")!);
    localStorage.setItem(`pt-solo-${seed}:pieces`, JSON.stringify([0, 5]));
    localStorage.removeItem(`pt-solo-${seed}:positions`);
  });
  await page.reload();
  await page.getByRole("button", { name: "Continue your puzzle" }).click();
  await expect(page.locator(".puzzle-toolbar")).toContainText(
    "2 of 12 pieces in place",
  );
  const layout = await layoutOf(page);
  expect(
    layout.tablePieces
      .filter((piece) => piece.placed)
      .map((piece) => piece.index)
      .sort((a, b) => a - b),
  ).toEqual([0, 5]);
  expect(
    layout.slots.some((piece) => piece.index === 0 || piece.index === 5),
  ).toBe(false);
});
