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

test("spreadsheet formula prefixes and original apostrophes round-trip as text", async () => {
  const samples = [
    "=1+1",
    " +12",
    "-3",
    "@example",
    "＝1＋1",
    "\t42",
    "\r42",
    "'=literal",
    "'ordinary",
    "plain",
  ];
  const gallery_items = samples.map((title) => ({
    id: crypto.randomUUID(),
    title,
    description: title,
    image_url: null,
    event_date: null,
  }));
  const zip = await exportToCsvZip({
    gallery_items,
    persons: [],
    relationships: [],
    custom_events: [],
    person_details_private: [],
  });
  const archive = await JSZip.loadAsync(await zip.arrayBuffer());
  const text = await archive.file("gallery_items.csv")!.async("text");
  const { default: Papa } = await import("papaparse");
  const cells = Papa.parse<{ title: string }>(text, {
    delimiter: ",",
    header: true,
  }).data.map((r) => r.title);
  expect(cells).toEqual(samples.map((s) => (s === "plain" ? s : "'" + s)));
  expect((await parseCsvZip(zip)).gallery_items).toEqual(gallery_items);
});

test("the CSV upload size limit also bounds expanded archive contents", async () => {
  const zip = new JSZip();
  zip.file("persons.csv", "note\n" + "a".repeat(8 * 1024 * 1024));
  zip.file("relationships.csv", "");
  const file = await zip.generateAsync({
    type: "blob",
    compression: "DEFLATE",
  });
  expect(file.size).toBeLessThan(1024 * 1024);
  await expect(parseCsvZip(file)).rejects.toThrow("8 MiB");
});
