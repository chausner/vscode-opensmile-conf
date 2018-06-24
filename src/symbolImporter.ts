#!/usr/bin/env node
'use strict';

// node .\out\symbolImporter.js -o assets\symbols_imported.json --smilextract-path C:\Users\chris\Downloads\opensmile-2.3.0\bin\Win32\SMILExtract_ReleasePortaudio.exe

import commander = require('commander');
import fs = require('fs');
import { symbolCache, FieldInfo } from './symbolCache';

let baseComponents: any = {
    openslesSource: 'cDataSource',
    juliusSink: 'cDataSink',
    libsvmliveSink: 'cDataSink',
    svmSink: 'cDataSink',
    dataSelector: 'cDataProcessor',
    nullSink: 'cDataSink',
    vectorProcessor: 'cDataProcessor',
    vectorTransform: 'cVectorProcessor',
    vecToWinProcessor: 'cDataProcessor',
    windowProcessor: 'cDataProcessor',
    winToVecProcessor: 'cDataProcessor',
    dbA: 'cVectorProcessor',
    signalGenerator: 'cDataSource',
    smileResample: 'cDataProcessor',
    specResample: 'cVectorProcessor',
    specScale: 'cVectorProcessor',
    vadV1: 'cDataProcessor',
    acf: 'cVectorProcessor',
    amdf: 'cVectorProcessor',
    contourSmoother: 'cWindowProcessor',
    deltaRegression: 'cWindowProcessor',
    fftmagphase: 'cVectorProcessor',
    framer: 'cWinToVecProcessor',
    fullinputMean: 'cDataProcessor',
    fullturnMean: 'cDataProcessor',
    monoMixdown: 'cDataProcessor',
    preemphasis: 'cWindowProcessor',
    transformFft: 'cVectorProcessor',
    transformFftr: 'cVectorProcessor',
    turnDetector: 'cDataProcessor',
    vectorMVN: 'cVectorTransform',
    vectorPreemphasis: 'cVectorProcessor',
    windower: 'cVectorProcessor',
    exampleProcessor: 'cDataProcessor',
    exampleSink: 'cDataSink',
    exampleSource: 'cDataSource',
    exampleVectorProcessor: 'cVectorProcessor',
    exampleWindowProcessor: 'cWindowProcessor',
    pitchBaseExample: 'cPitchBase',
    simpleMessageSender: 'cDataSink',
    functionals: 'cWinToVecProcessor',
    libsvmSink: 'cDataSink',
    arffSink: 'cDataSink',
    arffSource: 'cDataSource',
    csvSink: 'cDataSink',
    csvSource: 'cDataSource',
    datadumpSink: 'cDataSink',
    htkSink: 'cDataSink',
    htkSource: 'cDataSource',
    waveSink: 'cDataSink',
    waveSinkCut: 'cDataSink',
    waveSource: 'cDataSource',
    cens: 'cVectorProcessor',
    formantLpc: 'cVectorProcessor',
    formantSmoother: 'cVectorProcessor',
    harmonics: 'cVectorProcessor',
    lpc: 'cVectorProcessor',
    lsp: 'cVectorProcessor',
    pitchDirection: 'cDataProcessor',
    pitchJitter: 'cDataProcessor',
    pitchShs: 'cPitchBase',
    pitchSmootherViterbi: 'cDataProcessor',
    tonefilt: 'cDataProcessor',
    energy: 'cVectorProcessor',
    intensity: 'cVectorProcessor',
    melspec: 'cVectorProcessor',
    mfcc: 'cVectorProcessor',
    mzcr: 'cVectorProcessor',
    pitchACF: 'cVectorProcessor',
    pitchBase: 'cVectorProcessor',
    pitchSmoother: 'cVectorProcessor',
    plp: 'cVectorProcessor',
    spectral: 'cVectorProcessor',
    bowProducer: 'cDataSource',
    maxIndex: 'cVectorProcessor',
    valbasedSelector: 'cDataProcessor',
    vectorConcat: 'cVectorProcessor',
    vectorOperation: 'cVectorProcessor',
    portaudioDuplex: 'cDataProcessor',
    portaudioSink: 'cDataSink',
    portaudioSource: 'cDataSource',
    portaudioWavplayer: 'cDataSink',
    rnnProcessor: 'cDataProcessor',
    rnnSink: 'cDataSink',
    rnnVad2: 'cDataProcessor',
    openCVSource: 'cDataSource',
    tonespec: 'cVectorProcessor',
    chroma: 'cVectorProcessor',
};

let program = 
    commander
    .option('--smilextract-path [path]', 'path to the SMILExtract binary of openSMILE', undefined, 'SMILExtract')
    .option('-o, --output-path <path>', 'path where to save the generated JSON file with symbol information')
    .parse(process.argv);

if (!program.outputPath) {
    program.help();
}

function getBaseComponent(component: string): string | undefined {
    for (let key in baseComponents) {
        if (component.toLowerCase() === ('c' + key).toLowerCase()) {
            return baseComponents[key];
        }
    }
    return undefined;
}

function parseObject(object: string, containerObjectField: string, containerFieldInfos: FieldInfo[], objectsCollection: Array<any>) {
    let objectOutput: any = {
        object: object,
        fields: []
    };
    for (let field of containerFieldInfos) {
        // only iterate over fields that are direct children of the object (no grand-children)
        if (!field.field.startsWith(containerObjectField + ".") ||
            field.field.indexOf('.', containerObjectField.length + 1) !== -1) {
            continue;
        }
        let relativeField: FieldInfo = {
            field: field.field.substr((containerObjectField + ".").length),
            type: field.type,
            default: field.default,
            description: field.description,
            required: field.required,
            visibility: field.visibility,
            typeHint: field.typeHint,
            suggestedValues: field.suggestedValues,
            allowedValues: field.allowedValues,
            recommendedValue: field.recommendedValue
        };
        let siblings = 
            Array.from(containerFieldInfos)
            .filter(fi => fi.field.startsWith(containerObjectField + "."))
            .map(fi => { return {
                field: fi.field.substr((containerObjectField + ".").length),
                type: fi.type,
                default: fi.default,
                description: fi.description,
                required: fi.required,
                visibility: fi.visibility,
                typeHint: fi.typeHint,
                suggestedValues: fi.suggestedValues,
                allowedValues: fi.allowedValues,
                recommendedValue: fi.recommendedValue
            }; });
        let fieldOutput = getFieldOutput(relativeField, siblings, undefined, objectsCollection);
        if (fieldOutput) {
            objectOutput.fields.push(fieldOutput);
        }
    }
    return objectOutput;
}

function getFieldOutput(field: FieldInfo, siblings: FieldInfo[], baseComponent: string | undefined, objectsCollection: Array<any>) {
    let fieldOutput: any = {
        field: field.field,
        description: field.description
    };
    if (baseComponent) {
        let baseComponentInfo = symbolCache.components.get(baseComponent);
        let baseField = baseComponentInfo && baseComponentInfo.fields.get(field.field);
        if (baseComponentInfo && baseField) {
            if (field.description === baseField.description && field.default === baseField.default && field.type === baseField.type) {
                return undefined; // skip any non-overridden inherited fields
            } else {
                fieldOutput.overridden = true;
            }                    
        }
    }
    if (field.type === 'numeric' || field.type === 'string' || field.type === 'char') {
        fieldOutput.type = field.type;
    } else if (/^object of type '(.+)'$/.test(field.type)) {
        let match = /^object of type '(.+)'$/.exec(field.type) as RegExpExecArray;
        let object = match[1];
        fieldOutput.type = object;
        if (!symbolCache.components.has(object) && !objectsCollection.some(o => o.object === object)) {
            let objectOutput = parseObject(object, field.field, siblings, objectsCollection);        
            objectsCollection.push(objectOutput);
        }
    } else {
        console.log(`Warning: unknown type ${field.type} of field ${field.field}`);
    }
    if (field.default !== undefined) {
        fieldOutput.default = field.default;
        if (field.type === 'string' || field.type === 'char') {
            let match = /^'(.*)'$/.exec(field.default as string);
            if (match) {
                if (match[1] === '(null)') {
                    fieldOutput.default = null;
                } else {
                    fieldOutput.default = match[1];
                }
            } else {
                console.log(`Error: unexpected format of default value: ${field.default}`);
            }                    
        } else if (field.type === 'numeric') {
            fieldOutput.default = parseFloat(field.default as string);
        }
    }
    return fieldOutput;
}

(async function run() {
    await symbolCache.populateCache(program.smilextractPath);

    let json: any = {
        version: '1.0',
        components: [],
        objects: []
    };
    
    for (let component of symbolCache.components.values()) {
        let componentOutput: any = {
            component: component.component,
            description: component.description,
            fields: []
        };
        componentOutput.baseComponent = getBaseComponent(component.component);
        if (!componentOutput.baseComponent) {
            console.log(`Warning: could not find base component of component ${component.component}`);
        }
        for (let field of component.fields.values()) {
            if (field.field.indexOf('.') !== -1) {
                continue; // skip any child fields of object fields
            }
            let fieldOutput = getFieldOutput(field, Array.from(component.fields.values()), componentOutput.baseComponent, json.objects);
            if (fieldOutput) {
                componentOutput.fields.push(fieldOutput);
            }
        }
        let readsFromLevels: string[] = [];
        let writesToLevels: string[] = [];     
        for (let field of component.fields.values()) {
            switch (field.type) {
                case 'object of type \'cDataReader\'': { 
                    readsFromLevels.push(field.field + '.dmLevel'); 
                    break;
                }
                case 'object of type \'cDataWriter\'': {
                    writesToLevels.push(field.field + '.dmLevel');
                    break;
                }
            }
        }
        if (readsFromLevels.length !== 0) {
            componentOutput.readsFromLevels = readsFromLevels;
        }
        if (writesToLevels.length !== 0) {
            componentOutput.writesToLevels = writesToLevels;
        }
        json.components.push(componentOutput);
    }

    let jsonString = JSON.stringify(json, undefined, 2);
    fs.writeFileSync(program.outputPath, jsonString, 'utf8');    
})();
