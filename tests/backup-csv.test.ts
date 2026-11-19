import { expect, test } from "bun:test";
import JSZip from "jszip";
import { exportToCsvZip, parseCsvZip } from "@/utils/csv";
test("CSV restore preserves phone numbers, date strings, gallery metadata and empty collections", async () => {
  const gallery_items = [
    {
      id: crypto.randomUUID(),
      title: "Ảnh",
      description: null,
      image_url: null,
      event_date: "2026-11-19",
    },
  ];
  const person_details_private = [
    {
      person_id: crypto.randomUUID(),
      phone_number: "0123456789",
      occupation: "true",
      current_residence: null,
    },
  ];
  const file = await exportToCsvZip({
    persons: [],
    relationships: [],
    gallery_items,
    person_details_private,
    custom_events: [],
  });
  const data = await parseCsvZip(file);
  expect(data).toMatchObject({
    version: 4,
    persons: [],
    relationships: [],
    gallery_items,
    person_details_private,
    custom_events: [],
  });
});
test("corrupt CSV rows cannot be silently restored", async () => {
  const file = new JSZip();
  file.file("persons.csv", "id,full_name\n1,Fred,unexpected");
  file.file("relationships.csv", "");
  await expect(
    parseCsvZip(await file.generateAsync({ type: "blob" })),
  ).rejects.toThrow();
});
