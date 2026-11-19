import { recordedLifeStatus } from "./dateHelpers";

export interface GedcomPerson {
  id?: string;
  full_name?: string | null;
  gender?: "male" | "female" | "other" | string;
  birth_year?: number | null;
  birth_month?: number | null;
  birth_day?: number | null;
  death_year?: number | null;
  death_month?: number | null;
  death_day?: number | null;
  death_lunar_year?: number | null;
  death_lunar_month?: number | null;
  death_lunar_day?: number | null;
  is_deceased?: boolean | null;
  is_in_law?: boolean;
  birth_order?: number | null;
  generation?: number | null;
  avatar_url?: string | null;
  note?: string | null;
}

export interface GedcomRelationship {
  type?: string;
  person_a?: string;
  person_b?: string;
}

function recordedDateParts(...parts: (number | null | undefined)[]) {
  return parts.map((part) => part ?? "?").join(" ");
}

export function exportToGedcom(data: {
  persons: GedcomPerson[];
  relationships: GedcomRelationship[];
}): string {
  let gedcom = "";

  // Header (GEDCOM 7.0)
  gedcom += "0 HEAD\n";
  gedcom += "1 GEDC\n";
  gedcom += "2 VERS 7.0\n";
  gedcom += "1 SOUR Giapha_OS\n";
  gedcom += "2 NAME Giapha OS\n";
  gedcom += "2 VERS 0.1.0\n";

  const personMap = new Map(
    data.persons.filter((p) => !!p.id).map((p) => [p.id!, p]),
  );

  // Map original IDs to short export IDs (to satisfy 20-char XREF limit)
  const exportIdMap = new Map<string, string>();
  let personCounter = 1;
  for (const person of data.persons) {
    if (person.id) {
      exportIdMap.set(person.id, `I${personCounter++}`);
    }
  }

  const getIndiXref = (id: string | undefined) =>
    id ? `@${exportIdMap.get(id) || id.replace(/-/g, "")}@` : "";

  // Helper formatting Date
  const formatNum = (n: number | null) =>
    n && n > 0 ? String(n).padStart(2, "0") : "";

  // Pre-process Families
  let familyCounter = 1;
  const marriages = data.relationships.filter((r) => r.type === "marriage");
  const childrenRels = data.relationships.filter(
    (r) => r.type === "biological_child" || r.type === "adopted_child",
  );

  const families: {
    id: string;
    husb?: string;
    wife?: string;
    children: string[];
  }[] = [];

  for (const marriage of marriages) {
    if (!marriage.person_a || !marriage.person_b) continue;
    const pA = personMap.get(marriage.person_a);
    const pB = personMap.get(marriage.person_b);
    if (!pA || !pB || !pA.id || !pB.id) continue;

    const fam = {
      id: `F${familyCounter++}`,
      husb: pA.gender === "male" ? pA.id : pB.gender === "male" ? pB.id : pA.id,
      wife:
        pA.gender === "female" ? pA.id : pB.gender === "female" ? pB.id : pB.id,
      children: [] as string[],
    };
    families.push(fam);
  }

  // Assign children to families
  for (const childRel of childrenRels) {
    const parentId = childRel.person_a;
    const childId = childRel.person_b;
    if (!parentId || !childId) continue;

    let fam = families.find((f) => f.husb === parentId || f.wife === parentId);

    if (!fam) {
      const pP = personMap.get(parentId);
      if (!pP) continue;
      fam = {
        id: `F${familyCounter++}`,
        husb: pP.gender === "male" ? parentId : undefined,
        wife: pP.gender === "female" ? parentId : undefined,
        children: [],
      };
      families.push(fam);
    }

    if (!fam.children.includes(childId)) {
      fam.children.push(childId);
    }
  }

  // Map persons to their families (for FAMC and FAMS)
  const personFamc = new Map<string, string[]>();
  const personFams = new Map<string, string[]>();

  for (const fam of families) {
    if (fam.husb) {
      const current = personFams.get(fam.husb) || [];
      if (!current.includes(fam.id))
        personFams.set(fam.husb, [...current, fam.id]);
    }
    if (fam.wife) {
      const current = personFams.get(fam.wife) || [];
      if (!current.includes(fam.id))
        personFams.set(fam.wife, [...current, fam.id]);
    }
    for (const childId of fam.children) {
      const current = personFamc.get(childId) || [];
      if (!current.includes(fam.id))
        personFamc.set(childId, [...current, fam.id]);
    }
  }

  // Export Individuals
  for (const person of data.persons) {
    if (!person.id) continue;
    gedcom += `0 ${getIndiXref(person.id)} INDI\n`;

    // Name
    if (person.full_name) {
      const parts = person.full_name.trim().split(" ");
      const lastName = parts.length > 1 ? parts.pop() : "";
      const firstName = parts.join(" ");
      gedcom += `1 NAME ${firstName} /${lastName}/\n`;
    } else {
      gedcom += `1 NAME Unknown /Unknown/\n`;
    }

    // Sex
    if (person.gender === "male") gedcom += "1 SEX M\n";
    else if (person.gender === "female") gedcom += "1 SEX F\n";
    else gedcom += "1 SEX U\n";

    // Birth
    if (person.birth_year || person.birth_month || person.birth_day) {
      gedcom += "1 BIRT\n";
      const day = formatNum(person.birth_day ?? null);
      const mont = getMonthName(person.birth_month ?? null);
      const yea = person.birth_year ? String(person.birth_year) : "";
      const dateParts = [day, mont, yea].filter(Boolean);
      if (dateParts.length > 0) {
        gedcom += `2 DATE ${dateParts.join(" ")}\n`;
      }
    }

    const deceased = recordedLifeStatus(person);
    if (deceased === false) gedcom += "1 _LIVING Y\n";

    // Death
    if (deceased) {
      gedcom += "1 DEAT Y\n";
      const { death_year: year, death_month: month, death_day: day } = person;
      if (year && (!day || month)) {
        const date = [formatNum(day ?? null), getMonthName(month ?? null), year]
          .filter(Boolean)
          .join(" ");
        gedcom += `2 DATE ${date}\n`;
      } else if (year || month || day) {
        // A day without its month or year cannot be expressed as a standard DATE.
        gedcom += `2 _SOLAR_DATE ${recordedDateParts(year, month, day)}\n`;
      }
      const lunar = [
        person.death_lunar_year,
        person.death_lunar_month,
        person.death_lunar_day,
      ];
      if (lunar.some(Boolean))
        gedcom += `2 _LUNAR_DATE ${recordedDateParts(...lunar)}\n`;
    }

    // Family Links
    const famcs = personFamc.get(person.id) || [];
    for (const famId of famcs) {
      gedcom += `1 FAMC @${famId}@\n`;
    }
    const famss = personFams.get(person.id) || [];
    for (const famId of famss) {
      gedcom += `1 FAMS @${famId}@\n`;
    }

    // Note
    if (person.note) {
      const lines = person.note.split("\n");
      gedcom += `1 NOTE ${lines[0]}\n`;
      for (let i = 1; i < lines.length; i++) {
        gedcom += `2 CONT ${lines[i]}\n`;
      }
    }
  }

  for (const fam of families) {
    gedcom += `0 @${fam.id}@ FAM\n`;
    if (fam.husb) gedcom += `1 HUSB ${getIndiXref(fam.husb)}\n`;
    if (fam.wife) gedcom += `1 WIFE ${getIndiXref(fam.wife)}\n`;
    for (const childId of fam.children) {
      gedcom += `1 CHIL ${getIndiXref(childId)}\n`;
    }
  }

  gedcom += "0 TRLR\n";
  return gedcom;
}

function getMonthName(month: number | null): string {
  if (!month) return "";
  const months = [
    "JAN",
    "FEB",
    "MAR",
    "APR",
    "MAY",
    "JUN",
    "JUL",
    "AUG",
    "SEP",
    "OCT",
    "NOV",
    "DEC",
  ];
  return months[month - 1] || "";
}

function parseMonthName(name: string): number | null {
  const months = [
    "JAN",
    "FEB",
    "MAR",
    "APR",
    "MAY",
    "JUN",
    "JUL",
    "AUG",
    "SEP",
    "OCT",
    "NOV",
    "DEC",
  ];
  const index = months.findIndex((m) => m === name.toUpperCase());
  return index !== -1 ? index + 1 : null;
}

function generateUUID() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0,
      v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function parseGedcom(gedcom: string): {
  persons: GedcomPerson[];
  relationships: GedcomRelationship[];
} {
  const lines = gedcom.split(/\r?\n/).filter((line) => line.trim().length > 0);

  const persons: GedcomPerson[] = [];
  const relationships: GedcomRelationship[] = [];
  const idMap = new Map<string, string>();

  type ParseRecord = {
    type: "INDI" | "FAM";
    id: string;
    lines: string[];
  };

  const records: ParseRecord[] = [];
  let currentRecord: ParseRecord | null = null;

  for (const line of lines) {
    if (line.startsWith("0 ")) {
      if (currentRecord) records.push(currentRecord);
      const match = line.match(/^0\s+@([^@]+)@\s+(INDI|FAM)/);
      if (match) {
        currentRecord = {
          id: match[1],
          type: match[2] as "INDI" | "FAM",
          lines: [],
        };
      } else {
        currentRecord = null;
      }
    } else if (currentRecord) {
      currentRecord.lines.push(line.trim());
    }
  }
  if (currentRecord) records.push(currentRecord);

  const families = new Set(
    records.filter((r) => r.type === "FAM").map((r) => r.id),
  );
  for (const record of records.filter((r) => r.type === "INDI")) {
    for (const line of record.lines) {
      if (!/^1\s+(?:FAMC|FAMS)(?:\s|$)/.test(line)) continue;
      const pointer = /^1\s+(?:FAMC|FAMS)\s+@([^@]+)@$/.exec(line);
      if (!pointer || !families.has(pointer[1]))
        throw Error("Tệp GEDCOM tham chiếu gia đình không tồn tại.");
    }
  }

  // Parse Individuals
  for (const record of records.filter((r) => r.type === "INDI")) {
    const uuid = generateUUID();
    if (idMap.has(record.id)) throw Error("Tệp GEDCOM có mã thành viên trùng lặp.");
    idMap.set(record.id, uuid);

    let fullName = "Unknown";
    let gender: "male" | "female" | "other" = "other";
    let is_deceased: boolean | null = null;
    let birth_day = null;
    let birth_month = null;
    let birth_year = null;
    let death_day = null;
    let death_month = null;
    let death_year = null;
    let death_lunar_year = null,
      death_lunar_month = null,
      death_lunar_day = null;
    let note = "";

    let currentTag = "";

    for (let i = 0; i < record.lines.length; i++) {
      const line = record.lines[i];
      const match = line.match(/^(\d+)\s+([A-Z0-9_]+)(?:\s+(.*))?$/);
      if (!match) continue;

      const level = parseInt(match[1]);
      const tag = match[2];
      const val = match[3] || "";

      if (level === 1) {
        currentTag = tag;
        if (tag === "NAME") {
          fullName = val.replace(/\//g, "").trim();
        } else if (tag === "SEX") {
          if (val === "M") gender = "male";
          else if (val === "F") gender = "female";
        } else if (tag === "_LIVING" && val === "Y" && is_deceased !== true) {
          is_deceased = false;
        } else if (tag === "DEAT") {
          if (!val || val === "Y") is_deceased = true;
          else if (val === "N" && is_deceased !== true) is_deceased = false;
        } else if (tag === "NOTE") {
          note = val;
        }
      } else if (level === 2) {
        if (currentTag === "NOTE" && tag === "CONT") {
          note += "\n" + val;
        } else if (currentTag === "BIRT" && tag === "DATE") {
          const cleanVal = val.replace(/^(ABT|EST|AFT|BEF|CAL)\s+/i, "");
          const parts = cleanVal.split(" ");
          if (parts.length === 3) {
            birth_day = parseInt(parts[0]) || null;
            birth_month = parseMonthName(parts[1]);
            birth_year = parseInt(parts[2]) || null;
          } else if (parts.length === 1) {
            birth_year = parseInt(parts[0]) || null;
          } else if (parts.length === 2) {
            birth_month = parseMonthName(parts[0]);
            birth_year = parseInt(parts[1]) || null;
          }
        } else if (
          currentTag === "DEAT" &&
          (tag === "_SOLAR_DATE" || tag === "_LUNAR_DATE")
        ) {
          const parts = val.trim().split(/\s+/);
          if (
            parts.length === 3 &&
            parts.every((part) => /^(?:-?\d+|\?)$/.test(part))
          ) {
            const date = parts.map((part) =>
              part === "?" ? null : Number(part),
            );
            if (date.some((part) => part !== null)) {
              is_deceased = true;
              if (tag === "_SOLAR_DATE")
                [death_year, death_month, death_day] = date;
              else
                [death_lunar_year, death_lunar_month, death_lunar_day] = date;
            }
          }
        } else if (currentTag === "DEAT" && tag === "DATE") {
          is_deceased = true;
          const cleanVal = val.replace(/^(ABT|EST|AFT|BEF|CAL)\s+/i, "");
          const parts = cleanVal.split(" ");
          if (parts.length === 3) {
            death_day = parseInt(parts[0]) || null;
            death_month = parseMonthName(parts[1]);
            death_year = parseInt(parts[2]) || null;
          } else if (parts.length === 1) {
            death_year = parseInt(parts[0]) || null;
          } else if (parts.length === 2) {
            death_month = parseMonthName(parts[0]);
            death_year = parseInt(parts[1]) || null;
          }
        }
      }
    }

    persons.push({
      id: uuid,
      full_name: fullName,
      gender,
      is_deceased,
      birth_day: Number.isNaN(birth_day) ? null : birth_day,
      birth_month,
      birth_year: Number.isNaN(birth_year) ? null : birth_year,
      death_day: Number.isNaN(death_day) ? null : death_day,
      death_month,
      death_year: Number.isNaN(death_year) ? null : death_year,
      death_lunar_year,
      death_lunar_month,
      death_lunar_day,
      is_in_law: false,
      birth_order: null,
      generation: null,
      avatar_url: null,
      note: note.length > 0 ? note : null,
    });
  }

  // Parse Families
  for (const record of records.filter((r) => r.type === "FAM")) {
    let husb = null;
    let wife = null;
    const children: string[] = [];

    for (const line of record.lines) {
      const match = line.match(/^1\s+(HUSB|WIFE|CHIL)\s+@([^@]+)@/);
      if (match) {
        const tag = match[1];
        const refId = match[2];
        const uuid = idMap.get(refId);
        if (!uuid) throw Error("Tệp GEDCOM tham chiếu thành viên không tồn tại.");

        if (tag === "HUSB") husb = uuid;
        else if (tag === "WIFE") wife = uuid;
        else if (tag === "CHIL") children.push(uuid);
      }
    }

    if ((husb && husb === wife) || children.some(id => id === husb || id === wife)) throw Error("Quan hệ GEDCOM không hợp lệ.");
    if (husb && wife) {
      relationships.push({
        type: "marriage",
        person_a: husb,
        person_b: wife,
      });
    }

    // Assigning children to both parents
    for (const childId of children) {
      if (husb && husb !== childId) {
        relationships.push({
          type: "biological_child",
          person_a: husb,
          person_b: childId,
        });
      }
      if (wife && wife !== childId) {
        relationships.push({
          type: "biological_child",
          person_a: wife,
          person_b: childId,
        });
      }
    }
  }

  // Deduplicate relationships to prevent database unique constraint errors
  const uniqueRelationships: GedcomRelationship[] = [];
  const seenKeys = new Set<string>();

  for (const rel of relationships) {
    const key = `${rel.type}_${rel.person_a}_${rel.person_b}`;
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      uniqueRelationships.push(rel);
    }
  }

  return { persons, relationships: uniqueRelationships };
}
