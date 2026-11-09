/**
 * Starter checklist library for a stainless steel fabrication shop.
 * Everything here is editable in the app — these are sensible defaults, not a compliance guarantee.
 * Customer/contract requirements always override. Build per-customer templates from these.
 */
export interface SeedItem {
  section: string; text: string; kind?: 'check' | 'value' | 'photo' | 'doc';
  unit?: string; spec?: string; reference?: string; required?: boolean;
  signer_role?: 'any' | 'inspector' | 'manager'; needs_verification?: boolean;
}
export interface SeedTemplate { name: string; description: string; category: 'base' | 'module'; items: SeedItem[] }

const S = {
  docs: '1. Order & documentation',
  ident: '2. Identification & traceability',
  insp: '3. Final inspection',
  surf: '4. Surface condition & contamination control',
  pack: '5. Packaging & protection',
  load: '6. Loading & carrier',
  rel: '7. Release',
};

export const TEMPLATES: SeedTemplate[] = [
  {
    name: 'Base — Every shipment (ISO 9001)',
    description: 'Core release checks for any stainless shipment: order match, traceability, final inspection, contamination control, packaging, carrier hand-off.',
    category: 'base',
    items: [
      { section: S.docs, text: 'Job / PO / packing list match the customer order (qty, part numbers, revision)', reference: 'ISO 9001 §8.6, 8.5.2' },
      { section: S.docs, text: 'Customer special requirements & notes reviewed and listed on this shipment', spec: 'Record any special requirement in the shipment header' },
      { section: S.docs, text: 'Drawing revision on parts matches released revision', kind: 'value', unit: 'Rev', spec: 'Enter revision shipped' },
      { section: S.docs, text: 'Final inspection report is complete and signed', kind: 'doc', signer_role: 'inspector', reference: 'ISO 9001 §8.6' },
      { section: S.docs, text: 'No open nonconformance / hold tag on any piece in this shipment', signer_role: 'inspector', reference: 'ISO 9001 §8.7' },
      { section: S.ident, text: 'Every piece carries legible part number / job number / heat or lot traceability marking', reference: 'ISO 9001 §8.5.2' },
      { section: S.ident, text: 'Base-metal heat numbers recorded under Materials and match the MTRs', signer_role: 'inspector', needs_verification: false },
      { section: S.ident, text: 'Material test reports (MTR / CMTR) attached for every heat', kind: 'doc', signer_role: 'inspector', reference: 'EN 10204 3.1 / ASTM A480' },
      { section: S.ident, text: 'Grade verified against order (304/304L/316/316L/2205/etc.)', kind: 'value', unit: 'grade', spec: 'Enter the grade confirmed', signer_role: 'inspector' },
      { section: S.insp, text: 'Overall / critical dimensions verified against drawing', kind: 'value', unit: 'in', spec: 'Record the key dimension and the gauge ID used', signer_role: 'inspector', reference: 'ISO 9001 §7.1.5 (calibrated gauges)' },
      { section: S.insp, text: 'Weld visual inspection complete: no cracks, undercut, porosity, spatter, arc strikes', signer_role: 'inspector', reference: 'AWS D1.6 / ASME Sec. IX per spec' },
      { section: S.surf, text: 'No iron / carbon-steel contamination, rust bloom, tea staining or heat tint beyond spec', spec: 'Cleaning/passivation per customer spec if flagged', reference: 'ASTM A380' },
      { section: S.surf, text: 'No gouges, deep scratches, dents or grinder burns; protective film intact where required' },
      { section: S.pack, text: 'Stainless kept off carbon steel: nonmetallic/dedicated stainless dunnage, felt/UHMW pads, nylon slings (no bare chain or steel forks)', reference: 'Industry practice to prevent galvanic/iron contamination' },
      { section: S.pack, text: 'Openings capped / sealed; no loose items rattling inside tube, pipe or vessels' },
      { section: S.pack, text: 'Packaging appropriate for weight, length and transit (box/crate/skid/bundle); fasteners are not carbon steel against stainless' },
      { section: S.pack, text: 'Packing list and shipping labels applied (customer part #, PO, qty, handling marks)' },
      { section: S.pack, text: 'Photo: packaged shipment, all sides, with labels visible', kind: 'photo' },
      { section: S.load, text: 'Shipment weight verified on calibrated scale', kind: 'value', unit: 'lb', spec: 'Record actual weight' },
      { section: S.load, text: 'Carrier, truck/trailer number and driver ID verified against pickup appointment', spec: 'Enter in the Logistics tab' },
      { section: S.load, text: 'BOL quantity, weight and description match shipment; BOL number recorded' },
      { section: S.load, text: 'Photo: loaded shipment as secured on the truck', kind: 'photo' },
      { section: S.rel, text: 'All required items above are complete and verified', signer_role: 'inspector' },
    ],
  },
  {
    name: 'Module — Small parts / parcel',
    description: 'Add for items that ship in a box (1" parts up to a few feet): counts, bagging, parcel/LTL labelling.',
    category: 'module',
    items: [
      { section: 'Small parts', text: 'Piece count verified (independent recount)', kind: 'value', unit: 'pcs', spec: 'Record counted quantity' },
      { section: 'Small parts', text: 'Parts individually bagged or separated so stainless does not scratch or touch other metals' },
      { section: 'Small parts', text: 'Box rated for weight; void fill used; box sealed and labelled (This Side Up / Fragile if applicable)' },
      { section: 'Small parts', text: 'Parcel / LTL tracking or pro number recorded', kind: 'value', unit: 'tracking #' },
    ],
  },
  {
    name: 'Module — Sanitary / 3-A / ASME BPE',
    description: 'Add for food, dairy, beverage, pharma & biotech: surface finish, passivation, weld inspection, cleanliness, documentation package.',
    category: 'module',
    items: [
      { section: 'Sanitary', text: 'Product-contact surface finish measured (Ra) and within spec', kind: 'value', unit: 'µin Ra', spec: 'e.g. ≤ 32 µin Ra (3-A) / ≤ 20 µin Ra (BPE SF2) — use the customer spec', signer_role: 'inspector', needs_verification: true, reference: 'ASME BPE SF / 3-A 00-01' },
      { section: 'Sanitary', text: 'Profilometer ID and calibration date recorded', kind: 'value', unit: 'gauge ID', signer_role: 'inspector' },
      { section: 'Sanitary', text: 'Passivation performed and documented (method, chemical lot, time/temp)', kind: 'doc', signer_role: 'inspector', reference: 'ASTM A967 / A380 / ASME BPE Pt. SF' },
      { section: 'Sanitary', text: 'Passivation test result recorded (water immersion / humidity / copper sulfate / ferroxyl per spec)', kind: 'value', unit: 'method/result', signer_role: 'inspector', reference: 'ASTM A967 Table 1' },
      { section: 'Sanitary', text: 'Electropolish certificate attached (if electropolished)', kind: 'doc', required: false },
      { section: 'Sanitary', text: 'Weld discoloration within accepted level (compare to AWS D18.2 color chart)', kind: 'value', unit: 'level', spec: 'Record the heat-tint level observed', signer_role: 'inspector', reference: 'AWS D18.2' },
      { section: 'Sanitary', text: 'Internal welds borescope-inspected: smooth, full penetration, no crevices, pits or protrusions', kind: 'doc', signer_role: 'inspector', needs_verification: true, reference: 'ASME BPE Pt. MJ / 3-A' },
      { section: 'Sanitary', text: 'Weld map / weld log with welder ID, process and purge records attached', kind: 'doc', signer_role: 'inspector', reference: 'ASME BPE Pt. MJ' },
      { section: 'Sanitary', text: 'Drainability / slope verified; no dead legs beyond spec', signer_role: 'inspector' },
      { section: 'Sanitary', text: 'Parts cleaned (degrease/rinse), dry, free of oils, particulates and test-water residue' },
      { section: 'Sanitary', text: 'Product-contact openings capped or bagged clean; gaskets/clamps counted where supplied' },
      { section: 'Sanitary', text: 'Certificate of Conformance and documentation package complete (MTRs, finish, passivation, weld records)', kind: 'doc', signer_role: 'inspector', needs_verification: true },
    ],
  },
  {
    name: 'Module — Pressure equipment (ASME B31.3 / VIII / PED)',
    description: 'Add for piping, vessels and pressure parts: test records, NDE, code documents, nameplate and Authorized Inspector hold points.',
    category: 'module',
    items: [
      { section: 'Pressure', text: 'Nameplate / code stamp present and data match the drawing (MAWP, temp, serial, year)', kind: 'photo', signer_role: 'inspector', needs_verification: true, reference: 'ASME VIII Div.1 UG-116 / PED Annex I' },
      { section: 'Pressure', text: 'National Board / registration number recorded (if applicable)', kind: 'value', unit: 'NB #', required: false },
      { section: 'Pressure', text: 'Hydrostatic / pneumatic test record: pressure, hold time, gauge calibration ID', kind: 'doc', signer_role: 'inspector', needs_verification: true, reference: 'ASME B31.3 §345 / VIII UG-99' },
      { section: 'Pressure', text: 'Test water chloride content within limit (stainless: commonly ≤ 50 ppm) and equipment drained & dried', kind: 'value', unit: 'ppm Cl', spec: 'Use spec limit; record measured value', signer_role: 'inspector', reference: 'Industry practice / ASME VIII' },
      { section: 'Pressure', text: 'NDE records reviewed and attached (RT / UT / PT / VT) with acceptance', kind: 'doc', signer_role: 'inspector', reference: 'ASME B31.3 §341 / VIII UW-50' },
      { section: 'Pressure', text: 'Weld map, WPS/PQR references and welder qualification IDs on file', kind: 'doc', signer_role: 'inspector', reference: 'ASME IX' },
      { section: 'Pressure', text: 'Material traceability to MTR incl. required impact / chemistry; PMI performed where specified', kind: 'doc', signer_role: 'inspector', needs_verification: true },
      { section: 'Pressure', text: 'Code data report (e.g. U-1A) / manufacturer data report / PED Declaration of Conformity complete', kind: 'doc', signer_role: 'manager', reference: 'ASME VIII / PED 2014/68/EU' },
      { section: 'Pressure', text: 'Authorized Inspector (AI) / Notified Body sign-off obtained where required (hold point)', kind: 'doc', signer_role: 'manager', needs_verification: true },
      { section: 'Pressure', text: 'Relief devices / nozzles / blind flanges tagged and protected', required: false },
    ],
  },
  {
    name: 'Module — Oversize / heavy load (up to 50 ft+)',
    description: 'Add for long, wide, tall or heavy shipments: dimensions, permits, escorts, rigging, FMCSA cargo securement, edge protection.',
    category: 'module',
    items: [
      { section: 'Oversize', text: 'Overall length recorded', kind: 'value', unit: 'in', spec: 'Longest overhang counts toward permit length' },
      { section: 'Oversize', text: 'Overall width and height recorded (as loaded on the trailer)', kind: 'value', unit: 'in', spec: 'Legal limits are typically 102 in wide and 13 ft 6 in high; state rules vary' },
      { section: 'Oversize', text: 'Gross cargo weight recorded', kind: 'value', unit: 'lb' },
      { section: 'Oversize', text: 'Oversize / overweight permits obtained for every state on route; permit numbers recorded', kind: 'doc', signer_role: 'inspector', spec: 'Required if over state legal dimension or weight' },
      { section: 'Oversize', text: 'Escort / pilot cars, flags, banners and lights arranged per permit', required: false },
      { section: 'Oversize', text: 'Trailer type suitable (flatbed / step-deck / RGN / lowboy) and rated for weight and height', kind: 'value', unit: 'trailer type' },
      { section: 'Oversize', text: 'Lifting points / lugs identified; rigging, spreader bars and slings rated and inspected', signer_role: 'inspector', needs_verification: true, reference: 'ASME B30.9 / B30.20' },
      { section: 'Oversize', text: 'Cradles / saddles / blocking fit the piece; stainless isolated from steel with nonmetallic padding' },
      { section: 'Oversize', text: 'Tie-down count meets FMCSA minimum for length; aggregate working load limit ≥ 50% of cargo weight', kind: 'value', unit: 'count', spec: '49 CFR 393.110: >10 ft needs 2 tie-downs for the first 10 ft + 1 per additional 10 ft (or fraction). Use the calculator on the Logistics tab.', signer_role: 'inspector', needs_verification: true, reference: '49 CFR 393.100–393.136' },
      { section: 'Oversize', text: 'Edge protectors / corner guards under every strap and chain; no strap or chain on weld seams or finished surfaces' },
      { section: 'Oversize', text: 'Loose items, ladders, nozzles and long overhangs secured; tarped if required for weather' },
      { section: 'Oversize', text: 'Photos: securement overall, each tie-down, load markings and flags', kind: 'photo', signer_role: 'inspector' },
      { section: 'Oversize', text: 'Driver reviewed securement and route with permits; driver signed BOL', signer_role: 'inspector' },
    ],
  },
];
