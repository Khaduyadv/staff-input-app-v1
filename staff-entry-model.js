export function normalizeStaffSearch(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLocaleLowerCase('vi')
    .trim();
}

export function buildStaffDirectory(entities) {
  const directory = new Map();
  for (const entity of entities) {
    if (!entity.staff_id || !entity.staff) continue;
    if (!directory.has(entity.staff_id)) {
      directory.set(entity.staff_id, { id: entity.staff_id, name: entity.staff, role: 'CSKH', roleLabel: 'CSKH', entities: [], cbld: new Set() });
    }
    const person = directory.get(entity.staff_id);
    person.entities.push(entity);
    if (entity.assigned_cbld) person.cbld.add(entity.assigned_cbld);
  }
  return [...directory.values()].sort((a, b) => a.name.localeCompare(b.name, 'vi'));
}

export function stableCbldId(name) {
  return name ? `CBLD:${name}` : null;
}

export function buildEntryDirectory(entities) {
  const directory = new Map(buildStaffDirectory(entities).map((person) => [person.id, person]));
  for (const entity of entities) {
    if (!entity.assigned_cbld) continue;
    const id = stableCbldId(entity.assigned_cbld);
    if (!directory.has(id)) {
      directory.set(id, { id, name: entity.assigned_cbld, role: 'CBLD', roleLabel: 'CBLĐ', entities: [], cbld: new Set([entity.assigned_cbld]) });
    }
    directory.get(id).entities.push(entity);
  }
  return [...directory.values()].sort((a, b) => a.name.localeCompare(b.name, 'vi') || a.role.localeCompare(b.role));
}

// The snapshot carries CBLĐ and CSKH on the same assignment row. This builds
// an exact row-level relationship for the sandbox selector; it does not imply
// an organisational hierarchy or production permission.
export function buildCbldCskhDirectory(entities) {
  const cbldDirectory = new Map();
  for (const entity of entities) {
    if (!entity.assigned_cbld || !entity.staff_id || !entity.staff) continue;
    const cbldId = stableCbldId(entity.assigned_cbld);
    if (!cbldDirectory.has(cbldId)) {
      cbldDirectory.set(cbldId, {
        id: cbldId,
        name: entity.assigned_cbld,
        entities: [],
        staff: new Map()
      });
    }
    const cbld = cbldDirectory.get(cbldId);
    cbld.entities.push(entity);
    if (!cbld.staff.has(entity.staff_id)) {
      cbld.staff.set(entity.staff_id, {
        id: entity.staff_id,
        name: entity.staff,
        role: 'CSKH',
        roleLabel: 'CSKH',
        relationship: 'DIRECT_ASSIGNMENT_EVIDENCE',
        entities: []
      });
    }
    cbld.staff.get(entity.staff_id).entities.push(entity);
  }
  return [...cbldDirectory.values()].map((cbld) => ({
    ...cbld,
    staff: [...cbld.staff.values()].sort((a, b) => a.name.localeCompare(b.name, 'vi'))
  })).sort((a, b) => a.name.localeCompare(b.name, 'vi'));
}

export function searchStaff(directory, query) {
  const normalizedQuery = normalizeStaffSearch(query);
  const queryTokens = normalizedQuery.split(/\s+/).filter(Boolean);
  return directory.filter((person) => {
    if (!queryTokens.length) return true;
    const normalizedName = normalizeStaffSearch(person.name);
    return queryTokens.every((token) => normalizedName.includes(token));
  });
}

export function resolveExactStaff(directory, staffId) {
  if (!staffId) return null;
  return directory.find((person) => person.id === staffId) || null;
}

export function portfolioForStaff(entities, staffId) {
  if (!staffId) return [];
  return entities.filter((entity) => entityMatchesStaff(entity, staffId));
}

export function portfolioForSelection(entities, cbldName, staffId) {
  if (!cbldName || !staffId) return [];
  return entities.filter((entity) => entity.assigned_cbld === cbldName && entity.staff_id === staffId);
}

export function entityMatchesStaff(entity, staffId) {
  if (!staffId) return false;
  return entity.staff_id === staffId || stableCbldId(entity.assigned_cbld) === staffId;
}
