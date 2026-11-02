import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { shuffledIndices } from "../src/lib/puzzle";

const errors = new Map<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const captured: string[] = [];
  errors.set(page, captured);
  page.on("pageerror", (error) => captured.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") captured.push(message.text());
  });
});
test.afterEach(async ({ page }) => {
  expect(errors.get(page), "No browser runtime or console errors").toEqual([]);
});

async function expectImagesDecoded(page: Page) {
  await expect
    .poll(() =>
      page
        .locator("img")
        .evaluateAll((images) =>
          images.every((image) => image.complete && image.naturalWidth > 0),
        ),
    )
    .toBe(true);
}
async function expectNoOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
}

async function startEasyPuzzle(page: Page) {
  await page.goto("/solo?art=wave");
  await expect(
    page.getByRole("heading", { name: "A moment for yourself." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Find the first piece" }).click();
  await expect(page.locator(".puzzle-workspace canvas")).toBeVisible();
  await expect(
    page
      .locator(".puzzle-toolbar")
      .getByText("0 of 12 pieces in place", { exact: true }),
  ).toBeVisible();
}
async function keyboardPlace(
  page: Page,
  index: number,
  row: number,
  column: number,
) {
  await page
    .getByRole("button", { name: `Select piece ${index + 1}`, exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Target row" })
    .selectOption({ value: String(row) });
  await page
    .getByRole("combobox", { name: "Target column" })
    .selectOption({ value: String(column) });
  await page
    .getByRole("button", { name: `Place piece ${index + 1}`, exact: true })
    .click();
}

test("home has a museum composition, responsive images, and functional navigation", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Good things come together." }),
  ).toBeVisible();
  await expectImagesDecoded(page);
  await expectNoOverflow(page);
  await page.screenshot({
    path: "/tmp/puzzletogether-desktop.png",
    fullPage: true,
  });
  await page
    .getByRole("link", { name: "Explore the collection", exact: true })
    .click();
  await expect(page).toHaveURL(/\/collection$/);
  await expect(
    page.getByRole("heading", { name: "Look a little closer." }),
  ).toBeVisible();
  await page.goto("/");
  await page.setViewportSize({ width: 390, height: 844 });
  await expectImagesDecoded(page);
  await expectNoOverflow(page);
  await page.screenshot({
    path: "/tmp/puzzletogether-mobile.png",
    fullPage: true,
  });
});

test("collection filters real artwork and search handles empty results", async ({
  page,
}) => {
  await page.goto("/collection");
  await expect(page.locator(".artwork-card")).toHaveCount(10);
  await page.getByRole("button", { name: "Architecture", exact: true }).click();
  await expect(page.locator(".artwork-card")).toHaveCount(2);
  await expect(
    page.getByRole("heading", { name: "The Night Café", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "All works", exact: true }).click();
  const search = page.getByRole("textbox", {
    name: "Search by artwork or artist",
  });
  await search.fill("Hokusai");
  await expect(page.locator(".artwork-card")).toHaveCount(1);
  await expect(
    page.getByRole("heading", { name: "The Great Wave", exact: true }),
  ).toBeVisible();
  await search.fill("no-such-artist-1024");
  await expect(
    page.getByRole("heading", { name: "No works in this corner." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Show all works" }).click();
  await expect(page.locator(".artwork-card")).toHaveCount(10);
  await expectImagesDecoded(page);
});

test("private rooms disclose missing configuration and offer working solo play", async ({
  page,
}) => {
  await page.goto("/create");
  await expect(
    page.getByText("The multiplayer gallery is not connected yet.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create a room", exact: true }),
  ).toBeDisabled();
  await page.getByRole("link", { name: "Take a solo seat" }).click();
  await expect(page).toHaveURL(/\/solo$/);
  await page.goto("/join?code=abc234");
  await expect(page.getByRole("textbox", { name: "Room code" })).toHaveValue(
    "ABC234",
  );
  await expect(
    page.getByRole("button", { name: "Join the room", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByText("The multiplayer gallery is not connected yet.", {
      exact: true,
    }),
  ).toBeVisible();
});

test("solo puzzle supports real dragging, rejects wrong placements, persists, resumes, and completes", async ({
  page,
}) => {
  await startEasyPuzzle(page);
  const seed = await page.evaluate(
    () => JSON.parse(localStorage.getItem("pt-solo-session")!).seed as string,
  );
  const index = shuffledIndices(12, seed)[0];
  const dimensions = await page.evaluate(async () => {
    const image = new Image();
    image.src = "/art/wave.jpg";
    await image.decode();
    return { width: image.naturalWidth, height: image.naturalHeight };
  });
  const ratio = dimensions.width / dimensions.height;
  const boardWidth = Math.min(720, 540 * ratio);
  const boardHeight = Math.min(540, 720 / ratio);
  const boardLeft = (800 - boardWidth) / 2;
  const trayTop = boardHeight + 82;
  const canvas = page.locator(".puzzle-workspace canvas");
  await canvas.scrollIntoViewIfNeeded();
  const rect = await canvas.boundingBox();
  expect(rect).not.toBeNull();
  const box = rect!;
  const scale = box.width / 800;
  const source = { x: box.x + 96 * scale, y: box.y + (trayTop + 54) * scale };
  const target = {
    x: box.x + (boardLeft + (((index % 4) + 0.5) * boardWidth) / 4) * scale,
    y: box.y + (24 + ((Math.floor(index / 4) + 0.5) * boardHeight) / 3) * scale,
  };
  await page.mouse.move(source.x, source.y);
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 24 });
  await page.mouse.up();
  await expect(
    page
      .locator(".puzzle-toolbar")
      .getByText("1 of 12 pieces in place", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Continue your puzzle" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Continue your puzzle" }).click();
  await expect(
    page
      .locator(".puzzle-toolbar")
      .getByText("1 of 12 pieces in place", { exact: true }),
  ).toBeVisible();
  await page.getByText("Prefer to use your keyboard?", { exact: true }).click();
  const wrongPiece = (index + 1) % 12;
  await keyboardPlace(
    page,
    wrongPiece,
    (Math.floor(wrongPiece / 4) + 1) % 3,
    wrongPiece % 4,
  );
  await expect(
    page.getByText("Not quite there. Try another position.", { exact: true }),
  ).toBeVisible();
  await expect(
    page
      .locator(".puzzle-toolbar")
      .getByText("1 of 12 pieces in place", { exact: true }),
  ).toBeVisible();
  for (let piece = 0; piece < 12; piece++) {
    if (piece === index) continue;
    await keyboardPlace(page, piece, Math.floor(piece / 4), piece % 4);
  }
  await expect(
    page.getByRole("heading", { name: "Every piece found its place." }),
  ).toBeVisible();
  await expect(
    page.getByText("12 pieces placed", { exact: true }),
  ).toBeVisible();
  await expectImagesDecoded(page);
  expect(
    await page.evaluate(
      () => !!JSON.parse(localStorage.getItem("pt-solo-session")!).completed,
    ),
  ).toBe(true);
});

test("solo difficulty switches generate the documented piece counts and mobile has no overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/solo");
  await page.getByRole("button", { name: /Take your time/ }).click();
  await page.getByRole("button", { name: "Find the first piece" }).click();
  await expect(page.locator(".puzzle-workspace canvas")).toBeVisible();
  await expect(
    page
      .locator(".puzzle-toolbar")
      .getByText("0 of 120 pieces in place", { exact: true }),
  ).toBeVisible();
  await expectNoOverflow(page);
  await page.getByText("Prefer to use your keyboard?", { exact: true }).click();
  await expect(
    page.getByRole("button", { name: /^Select piece \d+$/ }),
  ).toHaveCount(12);
  await expect(page.getByText("1 / 10", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Next pieces", exact: true }).click();
  await expect(page.getByText("2 / 10", { exact: true })).toBeVisible();
  await expectNoOverflow(page);
});

test("keyboard play rejects incorrect placement and restores persistent progress before completion", async ({
  page,
}) => {
  await startEasyPuzzle(page);
  await page.getByText("Prefer to use your keyboard?", { exact: true }).click();
  await keyboardPlace(page, 0, 1, 0);
  await expect(
    page.getByText("Not quite there. Try another position.", { exact: true }),
  ).toBeVisible();
  await expect(
    page
      .locator(".puzzle-toolbar")
      .getByText("0 of 12 pieces in place", { exact: true }),
  ).toBeVisible();
  await keyboardPlace(page, 0, 0, 0);
  await expect(
    page
      .locator(".puzzle-toolbar")
      .getByText("1 of 12 pieces in place", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Continue your puzzle" }).click();
  await expect(
    page
      .locator(".puzzle-toolbar")
      .getByText("1 of 12 pieces in place", { exact: true }),
  ).toBeVisible();
  await page.getByText("Prefer to use your keyboard?", { exact: true }).click();
  for (let piece = 1; piece < 12; piece++) {
    await keyboardPlace(page, piece, Math.floor(piece / 4), piece % 4);
  }
  await expect(
    page.getByRole("heading", { name: "Every piece found its place." }),
  ).toBeVisible();
  await expect(
    page.getByText("12 pieces placed", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => !!JSON.parse(localStorage.getItem("pt-solo-session")!).completed,
    ),
  ).toBe(true);
});

test("medium difficulty opens 48 pieces across four tray pages", async ({
  page,
}) => {
  await page.goto("/solo");
  await page.getByRole("button", { name: /Settle in/ }).click();
  await page.getByRole("button", { name: "Find the first piece" }).click();
  await expect(page.locator(".puzzle-workspace canvas")).toBeVisible();
  await expect(
    page
      .locator(".puzzle-toolbar")
      .getByText("0 of 48 pieces in place", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("1 / 4", { exact: true })).toBeVisible();
  await expectNoOverflow(page);
});
