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

test("recorded death facts override a stale living or unknown flag through GEDCOM", () => {
  const facts = [
    { is_deceased: false, death_year: 1987 },
    { is_deceased: null, death_year: 2023, death_month: 3, death_day: 25 },
    { is_deceased: false, death_month: 11, death_day: 15 },
    {
      is_deceased: null,
      death_lunar_year: 2023,
      death_lunar_month: -2,
      death_lunar_day: 4,
    },
  ];
  const gedcom = exportToGedcom({
    persons: facts.map((fact, i) => ({
      ...fact,
      id: String(i + 1),
      full_name: "Hồ sơ " + i,
    })),
    relationships: [],
  });
  expect(gedcom).not.toContain("_LIVING Y");
  expect(gedcom.match(/^1 DEAT Y$/gm)).toHaveLength(facts.length);
  expect(gedcom).toContain("2 DATE 1987");
  expect(gedcom).toContain("2 DATE 25 MAR 2023");
  const { persons } = parseGedcom(gedcom);
  for (const [index, fact] of facts.entries()) {
    expect(persons[index]).toMatchObject({ ...fact, is_deceased: true });
  }
});

test("GEDCOM restore rejects a duplicated individual or a family with a missing individual",()=>{
  for(const invalid of ["0 @I1@ INDI\n1 NAME Second","0 @F1@ FAM\n1 CHIL @missing@"]) {
    expect(()=>parseGedcom("0 HEAD\n0 @I1@ INDI\n1 NAME First\n"+invalid+"\n0 TRLR")).toThrow();
  }
});

test("a truncated GEDCOM cannot drop referenced families on restoration", () => {
  for (const tag of ["FAMC", "FAMS"])
    expect(() =>
      parseGedcom("0 HEAD\n0 @I1@ INDI\n1 NAME An\n1 " + tag + " @F2@\n0 TRLR"),
    ).toThrow();
});

test("GEDCOM preserves exact parent UUIDs and pedigree across multiple marriages", () => {
  const [a, b, c, d] = ["a", "b", "c", "d"].map(letter => letter.repeat(8) + "-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  const persons = [a, b, c, d].map((id, index) => ({ id, full_name: "Person " + index, gender: "other" }));
  const relationships = [
    { person_a: a, person_b: b, type: "marriage" },
    { person_a: a, person_b: c, type: "marriage" },
    { person_a: a, person_b: d, type: "adopted_child" },
    { person_a: c, person_b: d, type: "biological_child" },
  ];
  const text = exportToGedcom({ persons, relationships });
  const restored = parseGedcom(text);
  expect(restored.relationships).toHaveLength(4);
  for (const edge of relationships) expect(restored.relationships).toContainEqual(edge);
  expect(text).toContain("2 PEDI ADOPTED");
  expect(text).toContain("2 PEDI BIRTH");
  for (const modified of [
    text.replace("2 PEDI ADOPTED", "2 PEDI FOSTER"),
    text.replace("2 PEDI ADOPTED", ""),
    text.replace("2 PEDI ADOPTED", "2 PEDI ADOPTED\n2 PEDI BIRTH"),
  ]) expect(() => parseGedcom(modified)).toThrow();
});

test("two recorded parents in an external family do not imply a marriage", () => {
  const family = [
    "0 HEAD", "0 @A@ INDI", "0 @B@ INDI", "0 @D@ INDI", "1 FAMC @F@",
    "2 PEDI BIRTH", "0 @F@ FAM", "1 WIFE @A@", "1 HUSB @B@", "1 CHIL @D@", "0 TRLR",
  ].join("\n");
  expect(parseGedcom(family).relationships.map(r => r.type)).toEqual(["biological_child", "biological_child"]);
  const married = family.replace("1 WIFE", "1 MARR Y\n1 WIFE");
  expect(parseGedcom(married).relationships.map(r => r.type)).toContain("marriage");
  const legacy = "0 HEAD\n1 SOUR Giapha_OS\n0 @A@ INDI\n0 @B@ INDI\n0 @F@ FAM\n1 HUSB @A@\n1 WIFE @B@\n0 TRLR";
  expect(parseGedcom(legacy).relationships.map(r => r.type)).toEqual(["marriage"]);
});

test("GEDCOM individual pointers must match the family and role on round trip", () => {
  const data = exportToGedcom({
    persons: [
      { id: "a", full_name: "Cha", gender: "male" },
      { id: "b", full_name: "Mẹ", gender: "female" },
      { id: "c", full_name: "Con", gender: "other" },
    ],
    relationships: [
      { person_a: "a", person_b: "b", type: "marriage" },
      { person_a: "a", person_b: "c", type: "biological_child" },
      { person_a: "b", person_b: "c", type: "biological_child" },
    ],
  });
  const restored = parseGedcom(data);
  expect(restored.relationships).toHaveLength(3);
  for (const incomplete of [
    data.slice(0, data.indexOf("0 @F1@ FAM") + "0 @F1@ FAM".length),
    data.replace("1 HUSB @I1@", ""),
    data.replace("1 WIFE @I2@", ""),
    data.replace("1 CHIL @I3@", ""),
    data.replace("1 FAMC @F1@", "1 FAMS @F1@"),
    data.replace("1 FAMS @F1@", "1 FAMC @F1@"),
  ])
    expect(() => parseGedcom(incomplete)).toThrow();
});
