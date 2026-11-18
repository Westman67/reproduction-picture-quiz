export const BANK_OPTIONS=[{id:'physiology',label:'Physiology',href:'?bank=physiology'},{id:'pathology',label:'Pathology',href:'?bank=pathology'}];
export const BANKS=Object.fromEntries(BANK_OPTIONS.map(({id,label,href})=>[id,{id,dataRoot:`./data/${id}`,progressKey:`reproduction-${id}-picture-quiz-v1`,preferencesKey:`reproduction-${id}-picture-quiz-preferences-v1`,exportName:`reproduction-${id}-progress.json`,title:`Reproduction ${label} · Picture Quiz`,brand:`${label.toUpperCase()} PICTURE QUIZ`,eyebrow:`Reproduction · ${label}`,description:id==='physiology'?'Practice R1 through R7 with reviewed physiology visuals.':'Practice R8 onward and explore third-party images under Source type.',footer:`Reproduction · ${label} · Local picture quiz`,homeUrl:href}]));
export const CLINICAL_CASES = {
    id: 'clinical-cases',
    dataRoot: './data/clinical-cases',
    progressKey: 'reproduction-clinical-cases-progress-v1',
    preferencesKey: 'reproduction-clinical-cases-preferences-v1',
    exportName: 'reproduction-clinical-cases-progress.json',
    title: 'Reproduction · Clinical Cases',
    brand: 'CLINICAL CASES',
    footer: 'Reproduction · Clinical Cases',
    homeUrl: '?bank=clinical-cases',
};

export const PHARMACOLOGY = {
    id: 'pharmacology',
    dataRoot: './data/pharmacology',
    progressKey: 'reproduction-pharmacology-quiz-v1',
    preferencesKey: 'reproduction-pharmacology-quiz-preferences-v1',
    exportName: 'reproduction-pharmacology-progress.json',
    title: 'Reproduction · Pharmacology Quiz',
    brand: 'PHARMACOLOGY QUIZ',
    eyebrow: 'Reproduction · Pharmacology',
    description: 'Drug mechanism, adverse effect and therapy reasoning drawn from the reproduction lectures.',
    footer: 'Reproduction · Pharmacology · Local quiz',
    homeUrl: '?bank=pharmacology',
};

export const STUDY_SECTIONS = [
    ...BANK_OPTIONS.map(option => ({ ...option, dataRoot: BANKS[option.id].dataRoot })),
    { id: PHARMACOLOGY.id, label: 'Pharmacology', href: PHARMACOLOGY.homeUrl, dataRoot: PHARMACOLOGY.dataRoot },
    { id: CLINICAL_CASES.id, label: 'Clinical Cases', href: CLINICAL_CASES.homeUrl, dataRoot: CLINICAL_CASES.dataRoot },
];

export const COMBINED = {
    id: 'combined',
    progressKey: 'reproduction-combined-practice-v1',
    preferencesKey: 'reproduction-combined-practice-preferences-v1',
    exportName: 'reproduction-combined-practice-progress.json',
    title: 'Reproduction · Combined Practice',
    brand: 'COMBINED PRACTICE',
    footer: 'Reproduction · Combined Practice',
    homeUrl: '?bank=combined',
};

export function resolveBankConfig(search = '') {
    const params = new URLSearchParams(search);
    const bank = params.get('bank');
    if (bank === CLINICAL_CASES.id || (bank === 'pathology' && params.get('mode') === 'cases')) return CLINICAL_CASES;
    if (bank === COMBINED.id) return COMBINED;
    if (bank === PHARMACOLOGY.id) return PHARMACOLOGY;
    if (bank === 'supplementary') return BANKS.pathology;
    return Object.hasOwn(BANKS, bank) ? BANKS[bank] : BANKS.physiology;
}
