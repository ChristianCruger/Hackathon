import { analyse } from './Hack_slab';

(<any>window).run = () => {
	//  varialble inputs:
	let inputObj = {
		fck: 25,
		thick: 120,
		fiber: 3,
		dia_top: 6,
		dia_bot: 6,
		insulation: 60,
		ins_thick: 400,
	};

	let variables: variable[] = [];

	// variables and their ranges:
	variables.push({
		name: 'fck',
		startValue: inputObj.fck,
		min: 16,
		max: 40,
		interval: 5,
		enabled: true,
	});
	variables.push({
		name: 'thick',
		startValue: inputObj.thick,
		min: 100,
		max: 400,
		interval: 10,
		enabled: true,
	});
	variables.push({
		name: 'fiber',
		startValue: inputObj.fiber,
		min: 0,
		max: 10,
		interval: 1,
		enabled: true,
	});
	variables.push({
		name: 'dia_top',
		startValue: inputObj.dia_top,
		min: 0,
		max: 32,
		interval: 1,
		enabled: true,
	});
	variables.push({
		name: 'dia_bot',
		startValue: inputObj.dia_bot,
		min: 0,
		max: 32,
		interval: 1,
		enabled: true,
	});

	variables.push({
		name: 'insulation',
		startValue: inputObj.insulation,
		min: 60,
		max: 100,
		interval: 20,
		enabled: true,
	});
	variables.push({
		name: 'ins_thick',
		startValue: inputObj.ins_thick,
		min: 240,
		max: 480,
		interval: 80,
		enabled: true,
	});

	// initial call:
	let originalResults = analyse(
		inputObj.fck,
		inputObj.thick,
		String(inputObj.fiber),
		inputObj.dia_top,
		inputObj.dia_bot,
		'S' + inputObj.insulation,
		inputObj.ins_thick
	);
	// console.log('results', originalResults);

	let ScoreMap = new Map<string, variableScores>();

	// loop through all variables:
	for (let i = 0; i < variables.length; i++) {
		if (!variables[i].enabled) continue; // skip if disabled

		let newInput = { ...inputObj };

		newInput[variables[i].name] = variables[i].startValue + variables[i].interval;

		let newResults = analyse(
			newInput.fck,
			newInput.thick,
			String(newInput.fiber),
			newInput.dia_top,
			newInput.dia_bot,
			'S' + newInput.insulation,
			newInput.ins_thick
		);

		let UR_diff = 1 / newResults.utilization - 1 / originalResults.utilization;
		let Uval_diff = newResults.Uvalue - originalResults.Uvalue;
		let emissions_diff = newResults.emissions - originalResults.emissions;

		ScoreMap.set(variables[i].name, {
			name: variables[i].name,
			URscore: UR_diff / emissions_diff,
			UvalScore: Uval_diff / emissions_diff,
			emissionScore: emissions_diff,
			interval: variables[i].interval,
		});
	}

	console.log('ScoreMap', ScoreMap);
	// let RES = analyse(fck, thick, String(fiber), dia_top, dia_bot, 'S' + insulation, ins_thick);

	//asses the results:
};

type variable = {
	name: string;
	startValue: number;
	min: number;
	max: number;
	interval: number;
	enabled: boolean;
};

type variableScores = {
	name: string;
	URscore: number;
	UvalScore: number;
	emissionScore: number;
	interval: number;
};
