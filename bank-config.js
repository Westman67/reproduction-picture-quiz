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

export const STUDY_SECTIONS = [
    ...BANK_OPTIONS.map(option => ({ ...option, dataRoot: BANKS[option.id].dataRoot })),
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
    if (bank === 'supplementary') return BANKS.pathology;
    return Object.hasOwn(BANKS, bank) ? BANKS[bank] : BANKS.physiology;
}
