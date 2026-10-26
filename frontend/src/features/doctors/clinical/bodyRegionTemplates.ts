export interface BodyRegionMedication {
  id: string;
  medicineName: string;
  strength: string;
  dosage: string;
  route: string;
  frequency: string;
  duration: string;
  instructions: string;
}

export interface BodyRegionDefinition {
  region: string;
  fields: string[];
  medications: BodyRegionMedication[];
}

export const TEMPLATE_STORAGE_KEY = 'carehub-body-region-templates-v2';

export const DEFAULT_BODY_REGION_TEMPLATES: BodyRegionDefinition[] = [
  {
    region: 'Knee',
    fields: ['Range of motion', 'Stability (Lachman / Pivot / Collateral)', 'Swelling / effusion', 'Gait / weight bearing', 'Joint line tenderness', 'Patellofemoral tracking'],
    medications: [
      { id: 'knee-med-1', medicineName: 'Tab. Aceclofenac + Paracetamol', strength: '100mg / 325mg', dosage: '1 Tab', route: 'Oral', frequency: 'Twice daily (BD)', duration: '5 Days', instructions: 'Take after meals (Pain & anti-inflammatory)' },
      { id: 'knee-med-2', medicineName: 'Tab. Pantoprazole', strength: '40mg', dosage: '1 Tab', route: 'Oral', frequency: 'Once daily (OD)', duration: '5 Days', instructions: 'Take in morning on empty stomach' },
      { id: 'knee-med-3', medicineName: 'Tab. Thiocolchicoside', strength: '4mg', dosage: '1 Tab', route: 'Oral', frequency: 'Twice daily (BD)', duration: '5 Days', instructions: 'Take after meals (Muscle relaxant)' },
      { id: 'knee-med-4', medicineName: 'Tab. Calcium Carbonate + Vitamin D3', strength: '500mg / 250IU', dosage: '1 Tab', route: 'Oral', frequency: 'Once daily (OD)', duration: '30 Days', instructions: 'Take after dinner for bone mineralization' },
      { id: 'knee-med-5', medicineName: 'Tab. Glucosamine Sulfate + Chondroitin', strength: '750mg / 500mg', dosage: '1 Tab', route: 'Oral', frequency: 'Twice daily (BD)', duration: '60 Days', instructions: 'Take with water for knee joint cartilage preservation' },
      { id: 'knee-med-6', medicineName: 'Sachet. Rosehip Extract + Collagen Peptide Type II', strength: '275mg / 40mg', dosage: '1 Sachet', route: 'Oral', frequency: 'Once daily (OD)', duration: '30 Days', instructions: 'Dissolve in 100ml plain water and drink' },
      { id: 'knee-med-7', medicineName: 'Tab. Serratiopeptidase', strength: '10mg', dosage: '1 Tab', route: 'Oral', frequency: 'Twice daily (BD)', duration: '5 Days', instructions: 'Take before meals for joint effusion/swelling' },
      { id: 'knee-med-8', medicineName: 'Gel. Diclofenac Diethylamine + Linseed Oil + Menthol', strength: '1.16% w/w', dosage: 'Thin layer', route: 'Topical', frequency: '3 times daily (TDS)', duration: '7 Days', instructions: 'Apply gently around knee joint; do not massage vigorously' },
      { id: 'knee-med-9', medicineName: 'Cap. Pregabalin', strength: '75mg', dosage: '1 Cap', route: 'Oral', frequency: 'Once daily at night (HS)', duration: '10 Days', instructions: 'Take at bedtime for neuropathic / radiating knee pain' },
      { id: 'knee-med-10', medicineName: 'Tab. Tramadol + Paracetamol', strength: '37.5mg / 325mg', dosage: '1 Tab', route: 'Oral', frequency: 'SOS (As needed)', duration: '3 Days', instructions: 'Take only in case of severe acute knee pain (Max 2 tabs/day)' },
    ],
  },
  {
    region: 'Shoulder',
    fields: ['Range of motion (Abduction / Flexion / Rotation)', 'Rotator cuff strength (Empty can / Hawkins)', 'Tenderness / impingement', 'Functional movement / overhead reach', 'Biceps tendon stability', 'Scapular rhythm'],
    medications: [
      { id: 'shoulder-med-1', medicineName: 'Tab. Etoricoxib', strength: '90mg', dosage: '1 Tab', route: 'Oral', frequency: 'Once daily (OD)', duration: '5 Days', instructions: 'Take after breakfast (Anti-inflammatory)' },
      { id: 'shoulder-med-2', medicineName: 'Tab. Rabeprazole', strength: '20mg', dosage: '1 Tab', route: 'Oral', frequency: 'Once daily (OD)', duration: '5 Days', instructions: 'Take 30 mins before breakfast' },
      { id: 'shoulder-med-3', medicineName: 'Tab. Tolperisone HCl', strength: '150mg', dosage: '1 Tab', route: 'Oral', frequency: 'Twice daily (BD)', duration: '7 Days', instructions: 'Take after meals for rotator cuff / trapezius spasm' },
      { id: 'shoulder-med-4', medicineName: 'Tab. Calcium + Calcitriol', strength: '500mg / 0.25mcg', dosage: '1 Tab', route: 'Oral', frequency: 'Once daily (OD)', duration: '30 Days', instructions: 'Take after lunch' },
      { id: 'shoulder-med-5', medicineName: 'Tab. Methylcobalamin + Alpha Lipoic Acid', strength: '1500mcg / 100mg', dosage: '1 Tab', route: 'Oral', frequency: 'Once daily (OD)', duration: '30 Days', instructions: 'Take after breakfast for nerve recovery' },
      { id: 'shoulder-med-6', medicineName: 'Tab. Serratiopeptidase + Aceclofenac', strength: '15mg / 100mg', dosage: '1 Tab', route: 'Oral', frequency: 'Twice daily (BD)', duration: '5 Days', instructions: 'Take after meals for subacromial bursitis swelling' },
      { id: 'shoulder-med-7', medicineName: 'Tab. Paracetamol', strength: '650mg', dosage: '1 Tab', route: 'Oral', frequency: 'SOS (Max 3/day)', duration: '5 Days', instructions: 'For breakthrough shoulder ache' },
      { id: 'shoulder-med-8', medicineName: 'Spray. Diclofenac Diethylamine', strength: '1.16% w/w', dosage: '2-3 Sprays', route: 'Topical', frequency: '3 times daily (TDS)', duration: '7 Days', instructions: 'Spray directly over painful shoulder area' },
      { id: 'shoulder-med-9', medicineName: 'Tab. Collagen Peptide Type I', strength: '40mg', dosage: '1 Tab', route: 'Oral', frequency: 'Once daily (OD)', duration: '30 Days', instructions: 'Take with water for tendon tissue elasticity' },
      { id: 'shoulder-med-10', medicineName: 'Sachet. Cholecalciferol (Vitamin D3)', strength: '60,000 IU', dosage: '1 Sachet', route: 'Oral', frequency: 'Once weekly', duration: '8 Weeks', instructions: 'Mix in 1 glass of warm milk once every Sunday' },
    ],
  },
  {
    region: 'Spine',
    fields: ['Region / level (Cervical / Lumbar / Dorsal)', 'Range of motion (Flexion / Extension / Lateral)', 'Neurological examination (SLR / Motor / Sensory / Reflexes)', 'Paraspinal tenderness / spasm', 'Radicular symptoms / Sciatica', 'Posture / gait'],
    medications: [
      { id: 'spine-med-1', medicineName: 'Tab. Aceclofenac + Paracetamol + Chlorzoxazone', strength: '100 / 325 / 250mg', dosage: '1 Tab', route: 'Oral', frequency: 'Twice daily (BD)', duration: '7 Days', instructions: 'Take after meals (Spinal pain & relaxant)' },
      { id: 'spine-med-2', medicineName: 'Tab. Pantoprazole', strength: '40mg', dosage: '1 Tab', route: 'Oral', frequency: 'Once daily (OD)', duration: '7 Days', instructions: 'Take in morning on empty stomach' },
      { id: 'spine-med-3', medicineName: 'Tab. Pregabalin + Methylcobalamin', strength: '75mg / 750mcg', dosage: '1 Tab', route: 'Oral', frequency: 'Once daily at night (HS)', duration: '14 Days', instructions: 'Take at bedtime for sciatica / radicular nerve pain' },
      { id: 'spine-med-4', medicineName: 'Tab. Tolperisone HCl', strength: '150mg', dosage: '1 Tab', route: 'Oral', frequency: 'Twice daily (BD)', duration: '7 Days', instructions: 'Take after food for paraspinal muscle spasm' },
      { id: 'spine-med-5', medicineName: 'Tab. Calcium Carbonate + Vitamin D3', strength: '500mg / 250IU', dosage: '1 Tab', route: 'Oral', frequency: 'Once daily (OD)', duration: '30 Days', instructions: 'Take after dinner for vertebral bone support' },
      { id: 'spine-med-6', medicineName: 'Tab. Trypsin + Chymotrypsin', strength: '100,000 AU', dosage: '1 Tab', route: 'Oral', frequency: 'Thrice daily (TDS)', duration: '5 Days', instructions: 'Take 30 mins before food for nerve root edema' },
      { id: 'spine-med-7', medicineName: 'Tab. Tramadol + Paracetamol', strength: '37.5mg / 325mg', dosage: '1 Tab', route: 'Oral', frequency: 'SOS (Night)', duration: '3 Days', instructions: 'Take at night if severe acute back pain restricts sleep' },
      { id: 'spine-med-8', medicineName: 'Gel. Diclofenac + Capsaicin', strength: '0.025%', dosage: 'Thin layer', route: 'Topical', frequency: 'Twice daily (BD)', duration: '10 Days', instructions: 'Gently apply over lumbosacral spine region' },
      { id: 'spine-med-9', medicineName: 'Sachet. Cholecalciferol (Vitamin D3)', strength: '60,000 IU', dosage: '1 Sachet', route: 'Oral', frequency: 'Once weekly', duration: '6 Weeks', instructions: 'Take with warm milk once every Sunday' },
      { id: 'spine-med-10', medicineName: 'Tab. Baclofen', strength: '10mg', dosage: '1 Tab', route: 'Oral', frequency: 'Twice daily (BD)', duration: '5 Days', instructions: 'Take after meals for severe back stiffness and spasticity' },
    ],
  },
  {
    region: 'Hip',
    fields: ['Range of motion (Flexion / Rotation / Abduction)', 'Gait / Trendelenburg test', 'Tenderness / groin pain', 'Functional movement / squatting', 'Leg length discrepancy', 'Trochanteric bursitis assessment'],
    medications: [
      { id: 'hip-med-1', medicineName: 'Tab. Etodolac + Paracetamol', strength: '400mg / 325mg', dosage: '1 Tab', route: 'Oral', frequency: 'Twice daily (BD)', duration: '7 Days', instructions: 'Take after meals (Anti-inflammatory)' },
      { id: 'hip-med-2', medicineName: 'Tab. Esomeprazole', strength: '40mg', dosage: '1 Tab', route: 'Oral', frequency: 'Once daily (OD)', duration: '7 Days', instructions: 'Take 30 mins before morning breakfast' },
      { id: 'hip-med-3', medicineName: 'Tab. Thiocolchicoside', strength: '8mg', dosage: '1 Tab', route: 'Oral', frequency: 'Once daily (OD)', duration: '5 Days', instructions: 'Take after dinner for pelvic / gluteal muscle spasm' },
      { id: 'hip-med-4', medicineName: 'Tab. Glucosamine + Chondroitin + MSM', strength: '750 / 500 / 250mg', dosage: '1 Tab', route: 'Oral', frequency: 'Twice daily (BD)', duration: '60 Days', instructions: 'Take with meals for hip joint cartilage preservation' },
      { id: 'hip-med-5', medicineName: 'Tab. Calcium Citrate Malate + Vitamin D3', strength: '250mg / 100IU', dosage: '2 Tabs', route: 'Oral', frequency: 'Once daily (OD)', duration: '30 Days', instructions: 'Take after lunch' },
      { id: 'hip-med-6', medicineName: 'Tab. Serratiopeptidase', strength: '10mg', dosage: '1 Tab', route: 'Oral', frequency: 'Twice daily (BD)', duration: '5 Days', instructions: 'Take before meals for trochanteric swelling' },
      { id: 'hip-med-7', medicineName: 'Tab. Methylcobalamin', strength: '1500mcg', dosage: '1 Tab', route: 'Oral', frequency: 'Once daily (OD)', duration: '30 Days', instructions: 'Take after breakfast for nerve and bone health' },
      { id: 'hip-med-8', medicineName: 'Gel. Ketoprofen Gel', strength: '2.5%', dosage: 'Thin layer', route: 'Topical', frequency: 'Twice daily (BD)', duration: '10 Days', instructions: 'Apply over lateral hip and trochanteric area' },
      { id: 'hip-med-9', medicineName: 'Tab. Paracetamol', strength: '650mg', dosage: '1 Tab', route: 'Oral', frequency: 'SOS', duration: '5 Days', instructions: 'Take for mild ache relief' },
      { id: 'hip-med-10', medicineName: 'Tab. Alendronate Sodium', strength: '70mg', dosage: '1 Tab', route: 'Oral', frequency: 'Once weekly', duration: '4 Weeks', instructions: 'Take with full glass of water on empty stomach; stay upright for 30 mins' },
    ],
  },
  {
    region: 'Elbow',
    fields: ['Range of motion (Flexion / Extension / Pronation / Supination)', 'Epicondylar tenderness (Tennis / Golfer elbow test)', 'Stability (Collateral ligaments)', 'Grip strength', 'Ulnar nerve subluxation / Tinel sign'],
    medications: [
      { id: 'elbow-med-1', medicineName: 'Tab. Aceclofenac + Serratiopeptidase', strength: '100mg / 15mg', dosage: '1 Tab', route: 'Oral', frequency: 'Twice daily (BD)', duration: '5 Days', instructions: 'Take after food for tendinitis & swelling' },
      { id: 'elbow-med-2', medicineName: 'Tab. Pantoprazole', strength: '40mg', dosage: '1 Tab', route: 'Oral', frequency: 'Once daily (OD)', duration: '5 Days', instructions: 'Take in morning on empty stomach' },
      { id: 'elbow-med-3', medicineName: 'Tab. Thiocolchicoside', strength: '4mg', dosage: '1 Tab', route: 'Oral', frequency: 'Twice daily (BD)', duration: '5 Days', instructions: 'Take after meals for forearm extensor spasm' },
      { id: 'elbow-med-4', medicineName: 'Gel. Diclofenac + Methyl Salicylate + Menthol', strength: '1.16% w/w', dosage: 'Thin layer', route: 'Topical', frequency: '3 times daily (TDS)', duration: '10 Days', instructions: 'Apply over lateral epicondyle; do not press hard' },
      { id: 'elbow-med-5', medicineName: 'Tab. Bromelain + Trypsin + Rutoside', strength: '90 / 48 / 100mg', dosage: '1 Tab', route: 'Oral', frequency: 'Twice daily (BD)', duration: '7 Days', instructions: 'Take 30 mins before food for enzymatic healing' },
      { id: 'elbow-med-6', medicineName: 'Tab. Calcium + Vitamin D3', strength: '500mg / 250IU', dosage: '1 Tab', route: 'Oral', frequency: 'Once daily (OD)', duration: '30 Days', instructions: 'Take after dinner for bone health' },
      { id: 'elbow-med-7', medicineName: 'Tab. Vitamin B-Complex with B12', strength: 'Forte', dosage: '1 Tab', route: 'Oral', frequency: 'Once daily (OD)', duration: '30 Days', instructions: 'Take after breakfast for tendon repair' },
      { id: 'elbow-med-8', medicineName: 'Tab. Collagen Peptide Type I', strength: '40mg', dosage: '1 Tab', route: 'Oral', frequency: 'Once daily (OD)', duration: '30 Days', instructions: 'Take with water for tendon elasticity' },
      { id: 'elbow-med-9', medicineName: 'Tab. Paracetamol', strength: '650mg', dosage: '1 Tab', route: 'Oral', frequency: 'SOS', duration: '5 Days', instructions: 'Take for mild elbow pain relief' },
      { id: 'elbow-med-10', medicineName: 'Ice pack compression', strength: 'Cold pack', dosage: '15 mins', route: 'Physical', frequency: '3 times daily', duration: '7 Days', instructions: 'Apply cold compression over lateral elbow 3 times daily' },
    ],
  },
  {
    region: 'Wrist & Hand',
    fields: ['Range of motion (Dorsiflexion / Palmar flexion / Ulnar deviation)', 'Grip strength & pinch test', 'Phalen & Tinel test (Carpal tunnel)', 'Finkelstein test (De Quervain)', 'Swelling / effusion / deformity'],
    medications: [
      { id: 'wrist-med-1', medicineName: 'Tab. Aceclofenac', strength: '100mg', dosage: '1 Tab', route: 'Oral', frequency: 'Twice daily (BD)', duration: '5 Days', instructions: 'Take after meals' },
      { id: 'wrist-med-2', medicineName: 'Tab. Pantoprazole', strength: '40mg', dosage: '1 Tab', route: 'Oral', frequency: 'Once daily (OD)', duration: '5 Days', instructions: 'Take on empty stomach in morning' },
      { id: 'wrist-med-3', medicineName: 'Tab. Pregabalin + Methylcobalamin', strength: '75mg / 750mcg', dosage: '1 Tab', route: 'Oral', frequency: 'Once daily at night (HS)', duration: '14 Days', instructions: 'Take at bedtime for carpal tunnel tingling/numbness' },
      { id: 'wrist-med-4', medicineName: 'Tab. Alpha Lipoic Acid + Benfotiamine', strength: '100mg / 50mg', dosage: '1 Tab', route: 'Oral', frequency: 'Once daily (OD)', duration: '30 Days', instructions: 'Take after breakfast for median nerve recovery' },
      { id: 'wrist-med-5', medicineName: 'Tab. Serratiopeptidase', strength: '10mg', dosage: '1 Tab', route: 'Oral', frequency: 'Twice daily (BD)', duration: '5 Days', instructions: 'Take before meals for tenosynovitis swelling' },
      { id: 'wrist-med-6', medicineName: 'Gel. Piroxicam Gel', strength: '0.5%', dosage: 'Thin layer', route: 'Topical', frequency: 'Twice daily (BD)', duration: '7 Days', instructions: 'Gently apply over dorsal wrist and radial styloid' },
      { id: 'wrist-med-7', medicineName: 'Tab. Paracetamol', strength: '650mg', dosage: '1 Tab', route: 'Oral', frequency: 'SOS', duration: '5 Days', instructions: 'Take for wrist ache relief' },
      { id: 'wrist-med-8', medicineName: 'Tab. Calcium Carbonate', strength: '500mg', dosage: '1 Tab', route: 'Oral', frequency: 'Once daily (OD)', duration: '30 Days', instructions: 'Take after food' },
      { id: 'wrist-med-9', medicineName: 'Sachet. Cholecalciferol (Vitamin D3)', strength: '60,000 IU', dosage: '1 Sachet', route: 'Oral', frequency: 'Once weekly', duration: '4 Weeks', instructions: 'Take with milk once weekly' },
      { id: 'wrist-med-10', medicineName: 'Tab. Chymoral Forte', strength: '100,000 AU', dosage: '1 Tab', route: 'Oral', frequency: 'Thrice daily (TDS)', duration: '5 Days', instructions: 'Take 30 mins before food for soft tissue edema' },
    ],
  },
  {
    region: 'Ankle & Foot',
    fields: ['Range of motion (Dorsiflexion / Plantar flexion / Inversion / Eversion)', 'Anterior drawer & Talar tilt (Ligament stability)', 'Malleolar / Achilles / Plantar fascia tenderness', 'Swelling / ecchymosis / weight bearing ability', 'Arch examination (Pes planus / cavus)'],
    medications: [
      { id: 'ankle-med-1', medicineName: 'Tab. Etoricoxib', strength: '90mg', dosage: '1 Tab', route: 'Oral', frequency: 'Once daily (OD)', duration: '5 Days', instructions: 'Take after breakfast for acute ligament sprain' },
      { id: 'ankle-med-2', medicineName: 'Tab. Rabeprazole', strength: '20mg', dosage: '1 Tab', route: 'Oral', frequency: 'Once daily (OD)', duration: '5 Days', instructions: 'Take before food in morning' },
      { id: 'ankle-med-3', medicineName: 'Tab. Serratiopeptidase + Aceclofenac', strength: '15mg / 100mg', dosage: '1 Tab', route: 'Oral', frequency: 'Twice daily (BD)', duration: '5 Days', instructions: 'Take after food for ankle swelling & pain' },
      { id: 'ankle-med-4', medicineName: 'Gel. Diclofenac Diethylamine', strength: '1.16% w/w', dosage: 'Thin layer', route: 'Topical', frequency: '3 times daily (TDS)', duration: '7 Days', instructions: 'Apply gently around lateral malleolus; do not rub' },
      { id: 'ankle-med-5', medicineName: 'Tab. Calcium Carbonate + Vitamin D3', strength: '500mg / 250IU', dosage: '1 Tab', route: 'Oral', frequency: 'Once daily (OD)', duration: '30 Days', instructions: 'Take after dinner for bone mineralization' },
      { id: 'ankle-med-6', medicineName: 'Tab. Trypsin + Chymotrypsin', strength: '100,000 AU', dosage: '1 Tab', route: 'Oral', frequency: 'Thrice daily (TDS)', duration: '5 Days', instructions: 'Take 30 mins before meals for rapid sprain hematoma resolution' },
      { id: 'ankle-med-7', medicineName: 'Tab. Thiocolchicoside', strength: '4mg', dosage: '1 Tab', route: 'Oral', frequency: 'Twice daily (BD)', duration: '5 Days', instructions: 'Take after meals for calf muscle spasm' },
      { id: 'ankle-med-8', medicineName: 'Tab. Methylcobalamin', strength: '1500mcg', dosage: '1 Tab', route: 'Oral', frequency: 'Once daily (OD)', duration: '30 Days', instructions: 'Take after breakfast for plantar nerve & heel health' },
      { id: 'ankle-med-9', medicineName: 'Tab. Paracetamol', strength: '650mg', dosage: '1 Tab', route: 'Oral', frequency: 'SOS', duration: '5 Days', instructions: 'Take for pain as needed' },
      { id: 'ankle-med-10', medicineName: 'Sachet. Collagen Peptide Type I & II', strength: '10g', dosage: '1 Sachet', route: 'Oral', frequency: 'Once daily (OD)', duration: '30 Days', instructions: 'Mix in 100ml water for ligament & plantar fascia recovery' },
    ],
  },
  {
    region: 'Other / General',
    fields: ['Anatomical location', 'Range of motion / mobility', 'Deformity / alignment', 'Neurovascular status', 'Relevant orthopaedic findings'],
    medications: [
      { id: 'other-med-1', medicineName: 'Tab. Aceclofenac + Paracetamol', strength: '100mg / 325mg', dosage: '1 Tab', route: 'Oral', frequency: 'Twice daily (BD)', duration: '5 Days', instructions: 'Take after meals (Analgesic & anti-inflammatory)' },
      { id: 'other-med-2', medicineName: 'Tab. Pantoprazole', strength: '40mg', dosage: '1 Tab', route: 'Oral', frequency: 'Once daily (OD)', duration: '5 Days', instructions: 'Take in morning on empty stomach' },
      { id: 'other-med-3', medicineName: 'Tab. Thiocolchicoside', strength: '4mg', dosage: '1 Tab', route: 'Oral', frequency: 'Twice daily (BD)', duration: '5 Days', instructions: 'Take after meals for musculoskeletal muscle spasm' },
      { id: 'other-med-4', medicineName: 'Tab. Calcium Carbonate + Vitamin D3', strength: '500mg / 250IU', dosage: '1 Tab', route: 'Oral', frequency: 'Once daily (OD)', duration: '30 Days', instructions: 'Take after dinner for bone strength' },
      { id: 'other-med-5', medicineName: 'Tab. Serratiopeptidase', strength: '10mg', dosage: '1 Tab', route: 'Oral', frequency: 'Twice daily (BD)', duration: '5 Days', instructions: 'Take before meals for soft tissue swelling' },
      { id: 'other-med-6', medicineName: 'Gel. Diclofenac Diethylamine', strength: '1.16% w/w', dosage: 'Thin layer', route: 'Topical', frequency: '3 times daily (TDS)', duration: '7 Days', instructions: 'Apply gently over painful area' },
      { id: 'other-med-7', medicineName: 'Tab. Paracetamol', strength: '650mg', dosage: '1 Tab', route: 'Oral', frequency: 'SOS', duration: '5 Days', instructions: 'Take as needed for pain' },
      { id: 'other-med-8', medicineName: 'Sachet. Cholecalciferol (Vitamin D3)', strength: '60,000 IU', dosage: '1 Sachet', route: 'Oral', frequency: 'Once weekly', duration: '8 Weeks', instructions: 'Take weekly with milk' },
      { id: 'other-med-9', medicineName: 'Tab. Methylcobalamin', strength: '1500mcg', dosage: '1 Tab', route: 'Oral', frequency: 'Once daily (OD)', duration: '30 Days', instructions: 'Take after breakfast for nerve recovery' },
      { id: 'other-med-10', medicineName: 'Tab. Tramadol + Paracetamol', strength: '37.5mg / 325mg', dosage: '1 Tab', route: 'Oral', frequency: 'SOS', duration: '3 Days', instructions: 'Take only in case of severe acute pain' },
    ],
  },
];
export const TEMPLATES_UPDATED_EVENT = 'tosh-body-region-templates-updated';

export function getDefault10Tablets(regionName: string): BodyRegionMedication[] {
  const cleanId = regionName.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'region';
  return [
    { id: `${cleanId}-1`, medicineName: 'Tab. Aceclofenac + Paracetamol', strength: '100mg / 325mg', dosage: '1 Tab', route: 'Oral', frequency: 'Twice daily (BD)', duration: '5 Days', instructions: 'Take after meals (Analgesic & anti-inflammatory)' },
    { id: `${cleanId}-2`, medicineName: 'Tab. Pantoprazole', strength: '40mg', dosage: '1 Tab', route: 'Oral', frequency: 'Once daily (OD)', duration: '5 Days', instructions: 'Take in morning on empty stomach' },
    { id: `${cleanId}-3`, medicineName: 'Tab. Thiocolchicoside', strength: '4mg', dosage: '1 Tab', route: 'Oral', frequency: 'Twice daily (BD)', duration: '5 Days', instructions: 'Take after meals for muscle relaxation' },
    { id: `${cleanId}-4`, medicineName: 'Tab. Calcium Carbonate + Vitamin D3', strength: '500mg / 250IU', dosage: '1 Tab', route: 'Oral', frequency: 'Once daily (OD)', duration: '30 Days', instructions: 'Take after dinner for bone mineralization' },
    { id: `${cleanId}-5`, medicineName: 'Tab. Serratiopeptidase', strength: '10mg', dosage: '1 Tab', route: 'Oral', frequency: 'Twice daily (BD)', duration: '5 Days', instructions: 'Take before meals for joint effusion/swelling' },
    { id: `${cleanId}-6`, medicineName: 'Gel. Diclofenac Diethylamine', strength: '1.16% w/w', dosage: 'Thin layer', route: 'Topical', frequency: '3 times daily (TDS)', duration: '7 Days', instructions: 'Apply gently over painful area; do not massage vigorously' },
    { id: `${cleanId}-7`, medicineName: 'Tab. Paracetamol', strength: '650mg', dosage: '1 Tab', route: 'Oral', frequency: 'SOS (As needed)', duration: '5 Days', instructions: 'Take as needed for pain relief' },
    { id: `${cleanId}-8`, medicineName: 'Sachet. Cholecalciferol (Vitamin D3)', strength: '60,000 IU', dosage: '1 Sachet', route: 'Oral', frequency: 'Once weekly', duration: '8 Weeks', instructions: 'Take weekly with warm milk' },
    { id: `${cleanId}-9`, medicineName: 'Tab. Methylcobalamin', strength: '1500mcg', dosage: '1 Tab', route: 'Oral', frequency: 'Once daily (OD)', duration: '30 Days', instructions: 'Take after breakfast for nerve health & recovery' },
    { id: `${cleanId}-10`, medicineName: 'Tab. Tramadol + Paracetamol', strength: '37.5mg / 325mg', dosage: '1 Tab', route: 'Oral', frequency: 'SOS (As needed)', duration: '3 Days', instructions: 'Take in case of severe pain only' },
  ];
}

import { DATA_MODE } from '../../../services/repositories/mode';
import { requestJson } from '../../../services/api/httpClient';

let cachedApiTemplates: BodyRegionDefinition[] | null = null;

export async function fetchBodyRegionTemplates(): Promise<BodyRegionDefinition[]> {
  if (DATA_MODE === 'api') {
    try {
      const data = await requestJson<BodyRegionDefinition[]>('/templates/body-regions');
      if (Array.isArray(data)) {
        cachedApiTemplates = data;
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(data));
          window.dispatchEvent(new CustomEvent(TEMPLATES_UPDATED_EVENT, { detail: data }));
        }
        return data;
      }
    } catch (err) {
      console.warn('Failed to fetch templates from API, using local backup', err);
    }
  }
  return readBodyRegionTemplates();
}

export function readBodyRegionTemplates(): BodyRegionDefinition[] {
  if (cachedApiTemplates !== null) {
    return cachedApiTemplates;
  }
  if (typeof window !== 'undefined') {
    try {
      const raw = window.localStorage.getItem(TEMPLATE_STORAGE_KEY);
      if (raw) {
        const candidate = JSON.parse(raw) as unknown;
        if (Array.isArray(candidate)) {
          cachedApiTemplates = candidate as BodyRegionDefinition[];
          return candidate as BodyRegionDefinition[];
        }
      }
    } catch { /* proceed */ }
  }
  if (DATA_MODE === 'api') {
    return [];
  }
  return DEFAULT_BODY_REGION_TEMPLATES;
}

export async function saveBodyRegionTemplates(value: BodyRegionDefinition[]): Promise<void> {
  cachedApiTemplates = value;
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(value));
    window.dispatchEvent(new CustomEvent(TEMPLATES_UPDATED_EVENT, { detail: value }));
  }
  if (DATA_MODE === 'api') {
    try {
      const serverData = await requestJson<BodyRegionDefinition[]>('/templates/body-regions', {
        method: 'PUT',
        body: JSON.stringify(value),
      });
      if (Array.isArray(serverData) && serverData.length > 0) {
        cachedApiTemplates = serverData;
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(serverData));
        }
      }
    } catch (err) {
      console.warn('API sync failed, saved in local storage', err);
      throw err;
    }
  }
}
