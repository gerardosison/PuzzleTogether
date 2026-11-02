import { test, expect } from "@playwright/test";
import { resolve } from "node:path";

test("solo validates custom image bytes, loads a local photo, and traps preview keyboard focus", async ({
  page,
}) => {
  await page.goto("/solo?upload=1");
  const input = page.locator('input[type="file"]');
  await input.setInputFiles({
    name: "pretend.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.from("This is not a photograph."),
  });
  await expect(page.getByRole("alert")).toContainText(
    "not a valid JPG, PNG, or WebP",
  );
  await input.setInputFiles(resolve("public/art/wave.jpg"));
  await expect(
    page.getByRole("heading", { name: "wave", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Your own image • stored only on this device"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Find the first piece" }).click();
  await expect(page.locator("canvas")).toBeVisible();
  await page.getByRole("button", { name: "Look at the picture" }).click();
  const dialog = page.getByRole("dialog", { name: "Puzzle reference image" });
  await expect(dialog).toBeVisible();
  const close = page.getByRole("button", { name: "Close picture preview" });
  await expect(close).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(close).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Look at the picture" }),
  ).toBeFocused();
  const session = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("pt-solo-session")!),
  );
  expect(session.art.image).toMatch(/^data:image\/jpeg;base64,/);
});

test("medium puzzle exposes 48 real pieces across four tray pages", async ({
  page,
}) => {
  await page.goto("/solo?art=wave");
  await page.getByRole("button", { name: /Settle in/ }).click();
  await page.getByRole("button", { name: "Find the first piece" }).click();
  await expect(page.locator("canvas")).toBeVisible();
  await expect(page.locator(".puzzle-toolbar")).toContainText(
    "0 of 48 pieces in place",
  );
  await expect(page.getByText("1 / 4", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Next pieces" }).click();
  await expect(page.getByText("2 / 4", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Restart puzzle" }).click();
  const reset = page.getByRole("alertdialog");
  await expect(reset).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(reset).not.toBeVisible();
});
