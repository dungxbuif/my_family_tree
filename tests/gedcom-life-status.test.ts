import { expect, test } from "bun:test";
import { exportToGedcom, parseGedcom } from "@/utils/gedcom";

test("GEDCOM preserves a known living Person separately from unknown and deceased people", () => {
  const states = [false, null, true];
  const data = exportToGedcom({
    persons: states.map((is_deceased, index) => ({
      id: String(index + 1),
      full_name: "Tên " + index,
      is_deceased,
    })),
    relationships: [],
  });
  expect(parseGedcom(data).persons.map((person) => person.is_deceased)).toEqual(
    states,
  );
});
