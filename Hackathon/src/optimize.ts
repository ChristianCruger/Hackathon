import { analyse } from './Hack_slab';
// import { mysql } from '../node_modules/mysql/index';

//  varialble inputs:
let inputObj: inputObject = {
	fck: 30,
	thick: 100,
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
	enabled: false,
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
	enabled: false,
});
variables.push({
	name: 'ins_thick',
	startValue: inputObj.ins_thick,
	min: 240,
	max: 480,
	interval: 80,
	enabled: true,
});

console.log('orignalGuess', inputObj);
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
console.log('results', originalResults);

(<any>window).run = () => {
	let newGuess = makeNewGuess(variables, inputObj, originalResults);

	console.log('newGuess', newGuess);

	let newResults = analyse(
		newGuess.fck,
		newGuess.thick,
		String(newGuess.fiber),
		newGuess.dia_top,
		newGuess.dia_bot,
		'S' + newGuess.insulation,
		newGuess.ins_thick
	);

	console.log('newResults', newResults);

	inputObj = newGuess;
	originalResults = newResults;
};

function makeNewGuess(
	variables: variable[],
	inputObj: inputObject,
	originalResults: ReturnType<typeof analyse>
) {
	let Scores: { name: string; scores: variableScores }[] = [];
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

		let UR_diff = -(newResults.utilization - originalResults.utilization);
		let Uval_diff = newResults.Uvalue - originalResults.Uvalue;
		let emissions_diff = newResults.emissions - originalResults.emissions + Number.EPSILON;

		Scores.push({
			name: variables[i].name,
			scores: {
				URscore: UR_diff / emissions_diff,
				UvalScore: Uval_diff / emissions_diff,
				emissionScore: emissions_diff,
				interval: variables[i].interval,
			},
		});

		// post
	}

	//asses the results:
	var sorted = [...Scores].sort((a, b) => {
		return Math.abs(a.scores.URscore) - Math.abs(b.scores.URscore);
	});

	console.log('sorted', sorted);

	let newGuess: inputObject = { ...inputObj };

	// adjust lowest to min:
	let n = Math.max(1, Math.min(3, sorted.length - 2));
	console.log('n', n);
	let UR_estimate = originalResults.utilization;

	console.log('UR_original', originalResults.utilization);
	let j = 0;
	for (let i = 0; i < sorted.length - 1; i++) {
		let worst = sorted[i];
		let min = variables.find((x) => x.name === worst.name).min;

		console.log('considering reducing: ', worst.name);

		if (UR_estimate > 1 || inputObj[worst.name] === min) continue; // skip if disabled
		j++;

		let relativeChange0 =
			((inputObj[worst.name] - min) / worst.scores.interval) *
			Math.sign(worst.scores.emissionScore);
		newGuess[worst.name] = min;

		UR_estimate += -worst.scores.URscore * worst.scores.emissionScore * relativeChange0;
		console.log('change', worst.name, 'to min');

		if (j === n) break;
	}

	// adjust highest to max:
	for (let i = 0; i < n; i++) {
		console.log('UR', UR_estimate);
		let best = sorted[sorted.length - 1 - i];

		let max = variables.find((x) => x.name === best.name).max;
		let min = variables.find((x) => x.name === best.name).min;

		console.log('considering increasing: ', best.name);

		if (UR_estimate < 1.0049 || inputObj[best.name] === max) continue; // skip if disabled

		let relativeChange1 = (1 - UR_estimate) / (best.scores.URscore * best.scores.emissionScore);

		let newVal = Math.max(
			min,
			Math.min(
				max,
				inputObj[best.name] +
					relativeChange1 * best.scores.interval * Math.sign(best.scores.emissionScore)
			)
		);
		newGuess[best.name] = newVal;

		let RelativeActualChange = (newVal - inputObj[best.name]) / best.scores.interval;

		UR_estimate += RelativeActualChange * best.scores.URscore * best.scores.emissionScore;
		console.log('increasing ' + best.name + ' to ' + newVal);
		debugger;
	}

	return newGuess;
}

type inputObject = {
	fck: number;
	thick: number;
	fiber: number;
	dia_top: number;
	dia_bot: number;
	insulation: number;
	ins_thick: number;
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
	// name: string;
	URscore: number;
	UvalScore: number;
	emissionScore: number;
	interval: number;
};
