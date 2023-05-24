import '../../loadenv';
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import commandLineArgs, { OptionDefinition as ArgsOptionDefinition } from 'command-line-args';
import commandLineUsage, { OptionDefinition as UsageOptionDefinition } from 'command-line-usage';
import chalk from 'chalk';
import { getGenshinDataFilePath } from '../../loadenv';
import { getGenshinControl } from '../../domain/genshin/genshinControl';
import { ReadableView } from '../../../shared/types/genshin/readable-types';
import { closeKnex } from '../../util/db';
import { normGenshinText } from '../../domain/genshin/genshinText';
import { importNormalize, importPlainTextMap } from '../import_file_util';
import { GCGCharSkillDamage } from '../../../shared/types/genshin/gcg-types';
import { standardElementCode } from '../../../shared/types/genshin/manual-text-map';
import { VoiceItem, VoiceItemArrayMap } from '../../../shared/types/lang-types';
import { fetchCharacterFetters } from '../../domain/genshin/character/fetchCharacterFetters';

async function importGcgSkill() {
  const outDir = process.env.GENSHIN_DATA_ROOT;

  const skillExcelStr = fs.readFileSync(getGenshinDataFilePath('./ExcelBinOutput/GCGSkillExcelConfigData.json'), 'utf8');
  const skillExcelJson: any[] = JSON.parse(skillExcelStr);
  const skillInternalNames: Set<string> = new Set<string>();
  for (let skillExcel of skillExcelJson) {
    if (skillExcel['ODACBHLGCIN']) {
      skillInternalNames.add(skillExcel['ODACBHLGCIN']);
    }
  }

  const binOutputUnknownDir = getGenshinDataFilePath('./BinOutput/_unknown_dir');
  const unknownJsons = fs.readdirSync(binOutputUnknownDir).filter(file => path.extname(file) === '.json');

  const combined: {[name: string]: GCGCharSkillDamage} = {};

  for (let file of unknownJsons) {
    const fileData = fs.readFileSync(path.join(binOutputUnknownDir, file), 'utf8');
    const json: any = JSON.parse(fileData.toString());

    if (typeof json === 'object' && typeof json.name === 'string' && skillInternalNames.has(json.name)) {
      const name: string = json.name;
      const data: any = json['NGKMIMDBNPC'] || json['ACMGJEOBIEK'];
      if (!combined[name]) {
        combined[name] = {Name: name};
      }
      if (data) {
        combined[name].Damage = data["-2060930438"]?.value;
        combined[name].IndirectDamage = data["-1921818039"]?.value;
        combined[name].ElementTag = data["476224977"]?.ratio;

        if (name.startsWith('Effect_Damage_')) {
          combined[name].Element = standardElementCode(name.split('_')[2].toLowerCase());
        } else {
          combined[name].Element = standardElementCode(combined[name].ElementTag);
        }

        if (combined[name].Element === null) {
          delete combined[name].Element;
        }

        switch (combined[name].Element) {
          case 'PYRO':
            combined[name].ElementKeywordId = 103;
            break;
          case 'HYDRO':
            combined[name].ElementKeywordId = 102;
            break;
          case 'DENDRO':
            combined[name].ElementKeywordId = 107;
            break;
          case 'ELECTRO':
            combined[name].ElementKeywordId = 104;
            break;
          case 'ANEMO':
            combined[name].ElementKeywordId = 105;
            break;
          case 'CRYO':
            combined[name].ElementKeywordId = 101;
            break;
          case 'GEO':
            combined[name].ElementKeywordId = 106;
            break;
          case 'PHYSICAL':
            combined[name].ElementKeywordId = 100;
            break;
        }
      }
    }
  }
  console.log(chalk.blue('Done. Output written to: ' + outDir + '/GCGCharSkillDamage.json'));
  fs.writeFileSync(outDir + '/GCGCharSkillDamage.json', JSON.stringify(combined, null, 2));
}

async function importVoice() {
  const outDir = process.env.GENSHIN_DATA_ROOT;
  const jsonDir = getGenshinDataFilePath('./BinOutput/Voice/Items');

  const combined: VoiceItemArrayMap = {};

  const jsonsInDir = fs.readdirSync(jsonDir).filter(file => path.extname(file) === '.json');
  const unknownTriggers: Set<string> = new Set();

  jsonsInDir.forEach(file => {
    const fileData = fs.readFileSync(path.join(jsonDir, file), 'utf8');
    const json: {[guid: string]: any} = JSON.parse(fileData.toString());

    for (let voiceItem of Object.values(json)) {
      if (!voiceItem.gameTriggerArgs || !voiceItem._sourceNames) {
        continue;
      }

      let key: string;

      if (voiceItem._gameTrigger === 'Dialog') {
        key = 'Dialog_' + voiceItem.gameTriggerArgs;
      } else if (voiceItem._gameTrigger === 'DungeonReminder') {
        key = 'Reminder_' + voiceItem.gameTriggerArgs;
      } else if (voiceItem._gameTrigger === 'Fetter') {
        key = 'Fetter_' + voiceItem.gameTriggerArgs;
      } else if (voiceItem._gameTrigger === 'AnimatorEvent') {
        key = 'AnimatorEvent_' + voiceItem.gameTriggerArgs;
      } else if (voiceItem._gameTrigger === 'JoinTeam') {
        key = 'JoinTeam_' + voiceItem.gameTriggerArgs;
      } else if (voiceItem._gameTrigger === 'WeatherMonologue') {
        key = 'WeatherMonologue_' + voiceItem.gameTriggerArgs;
      } else if (voiceItem._gameTrigger === 'Card') {
        key = 'Card_' + voiceItem.gameTriggerArgs;
      } else {
        unknownTriggers.add(voiceItem._gameTrigger);
        continue;
      }

      combined[key] = [];

      for (let voiceSource of voiceItem._sourceNames) {
        let fileName: string = voiceSource.sourceFileName.split('\\').pop().toLowerCase().replace(/_/g, ' ').replace('.wem', '.ogg');
        let gender: number = voiceSource.gender;
        let voiceSourceNorm: VoiceItem = {id: voiceItem.gameTriggerArgs, fileName};
        if (voiceItem._gameTrigger) {
          voiceSourceNorm.type = voiceItem._gameTrigger;
        }
        if (gender === 1) {
          voiceSourceNorm.gender = 'F';
          voiceSourceNorm.isGendered = true;
        } else  if (gender === 2) {
          voiceSourceNorm.gender = 'M';
          voiceSourceNorm.isGendered = true;
        }
        let alreadyExisting = combined[key].find(x => x.fileName === voiceSourceNorm.fileName);
        if (alreadyExisting) {
          // Sometimes miHoYo adds duplicates like:
          //   { sourceFileName: 'VO_AQ\VO_nahida\vo_XMAQ305_13_nahida_16.wem', rate: 1.0, avatarName: 'Switch_hero', emotion: '', gender: 2 }
          //   { sourceFileName: 'VO_AQ\VO_nahida\vo_XMAQ305_13_nahida_16.wem', rate: 1.0, avatarName: 'Switch_heroine', emotion: '', gender: 1 }
          // where the only difference is the "gender"/"avatarName" property, but they use the same file.
          // In which case we want to only have one of them and remove the gender.
          if (voiceSourceNorm.gender && alreadyExisting.gender) {
            delete alreadyExisting.gender;
            delete voiceSourceNorm.isGendered;
          }
          continue;
        }
        combined[key].push(voiceSourceNorm);
      }
    }
  });

  if (unknownTriggers.size) {
    console.log(chalk.red('Unknown game triggers:', unknownTriggers));
  }
  console.log(chalk.blue('Done. Output written to: ' + outDir + '/voiceItemsNormalized.json'));
  fs.writeFileSync(outDir + '/voiceItemsNormalized.json', JSON.stringify(combined, null, 2));
}

async function importFetters() {
  const outDir = process.env.GENSHIN_DATA_ROOT;

  const ctrl = getGenshinControl();
  const allFetters = await fetchCharacterFetters(ctrl, true);

  console.log(chalk.blue('Done. Output written to: ' + outDir + '/CharacterFettersCombined.json'));
  fs.writeFileSync(outDir + '/CharacterFettersCombined.json', JSON.stringify(allFetters, null, 2));
}

async function importIndex() {
  if (!fs.existsSync(getGenshinDataFilePath('./TextMap/Index/'))) {
    fs.mkdirSync(getGenshinDataFilePath('./TextMap/Index/'));
  }

  const ctrl = getGenshinControl();

  const writeOutput = (file: string, data: any) => {
    fs.writeFileSync(getGenshinDataFilePath(`./TextMap/Index/TextIndex_${file}.json`), JSON.stringify(data, null, 2), 'utf8');
    console.log(chalk.blue(' (done)'));
  };

  {
    process.stdout.write(chalk.bold('Generating readable index...'));
    const archive = await ctrl.selectReadableArchiveView();
    const readableList: ReadableView[] = [
      ...archive.Artifacts,
      ...archive.Weapons,
      ...archive.Materials,
      ...Object.values(archive.BookCollections).flatMap(bookSuit => bookSuit.Books),
    ];
    const readableIndex: { [viewId: number]: number } = {};

    for (let view of readableList) {
      readableIndex[view.TitleTextMapHash] = view.Id;
    }
    writeOutput('Readable', readableIndex);
  }
  {
    process.stdout.write(chalk.bold('Generating material index...'));
    const materialList = await ctrl.selectAllMaterialExcelConfigData({ LoadRelations: false, LoadSourceData: false });
    const materialIndex: { [id: number]: number } = {};

    for (let material of materialList) {
      materialIndex[material.NameTextMapHash] = material.Id;
      materialIndex[material.DescTextMapHash] = material.Id;
    }
    writeOutput('Material', materialIndex);
  }
  {
    process.stdout.write(chalk.bold('Generating furniture index...'));
    const furnitureList = await ctrl.selectAllFurniture();
    const furnitureIndex: { [id: number]: number } = {};

    for (let furniture of furnitureList) {
      furnitureIndex[furniture.NameTextMapHash] = furniture.Id;
      furnitureIndex[furniture.DescTextMapHash] = furniture.Id;
    }
    writeOutput('Furniture', furnitureIndex);
  }
  {
    process.stdout.write(chalk.bold('Generating furniture index...'));
    const furnitureSuiteList = await ctrl.selectAllFurnitureSuite();
    const furnitureSuiteIndex: { [id: number]: number } = {};

    for (let furniture of furnitureSuiteList) {
      furnitureSuiteIndex[furniture.SuiteNameTextMapHash] = furniture.SuiteId;
      furnitureSuiteIndex[furniture.SuiteDescTextMapHash] = furniture.SuiteId;
    }
    writeOutput('FurnitureSuite', furnitureSuiteIndex);
  }
  {
    process.stdout.write(chalk.bold('Generating weapon index...'));
    const weaponList = await ctrl.selectAllWeapons();
    const weaponIndex: { [id: number]: number } = {};

    for (let weapon of weaponList) {
      weaponIndex[weapon.NameTextMapHash] = weapon.Id;
      weaponIndex[weapon.DescTextMapHash] = weapon.Id;
    }
    writeOutput('Weapon', weaponIndex);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  (async () => {
    const optionDefinitions: (ArgsOptionDefinition & UsageOptionDefinition)[] = [
      {name: 'normalize', type: Boolean, description: 'Normalizes the JSON files.'},
      {name: 'plaintext', type: Boolean, description: 'Creates the PlainTextMap files.'},
      {name: 'index', type: Boolean, description: 'Creates the index files for PlainTextMap.'},
      {name: 'voice', type: Boolean, description: 'Creates the normalized voice items file.'},
      {name: 'gcg-skill', type: Boolean, description: 'Creates file for GCG skill data'},
      {name: 'fetters', type: Boolean, description: 'Creates file for character fetters data'},
      {name: 'help', type: Boolean, description: 'Display this usage guide.'},
    ];

    const options = commandLineArgs(optionDefinitions);

    if (!Object.keys(options).length) {
      console.warn(chalk.yellow('\nNot enough arguments.'));
      options.help = true;
    }

    if (Object.keys(options).length > 1) {
      console.warn(chalk.red('\nAll arguments are mutually exclusive.'));
      options.help = true;
    }

    if (options.help) {
      const usage = commandLineUsage([
        {
          header: 'Genshin Data Files Importer',
          content: 'Imports Genshin Data json into other supporting files.'
        },
        {
          header: 'Options',
          optionList: optionDefinitions
        }
      ])
      console.log(usage);
      return;
    }

    if (options.normalize) {
      await importNormalize(getGenshinDataFilePath('./ExcelBinOutput'), ['ProudSkillExcelConfigData.json']);
    }
    if (options.plaintext) {
      await importPlainTextMap(getGenshinDataFilePath, normGenshinText);
    }
    if (options.index) {
      await importIndex();
    }
    if (options.voice) {
      await importVoice();
    }
    if (options['gcg-skill']) {
      await importGcgSkill();
    }
    if (options.fetters) {
      await importFetters();
    }

    await closeKnex();
  })();
}