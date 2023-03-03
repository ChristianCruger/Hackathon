import docWriter from './DocWriter';
import { Round, linkWrapper } from './helper_functions.js';

export function subbase(inputLayers: subbaseInput[], friction: number) {
	let doc = new docWriter();
	// let nLayers = input.length;

	let k: number[] = [];

	let insulation_layers: insulationLayer[] = [];

	let inv_sum = 0;
	doc.writeTitleTwo('Subbase');

	// doc.writeHeader('Subbases');
	doc.rowWidth = [25, 20, 5, 5, 5];
	doc.allignChildren = ['left', 'left', 'center', 'right', 'left'];
	doc.write('Combined modulus of following subbase layers:');
	doc.lineBreak();
	// doc.rowWidth = 25;

	let idx = 1;
	inputLayers.forEach((layer) => {
		doc.write(`${idx}: ${layer.name}`);

		let k0: number;
		if (layer.type === 'E-modulus') {
			// E-mod in kPa, thick in mm.

			k0 = (layer.value / layer.thickness) * 1e-3;
			k.push(k0);

			doc.write([
				'Modulus of subgrade from E-modulus:',
				`$$ k_{${idx}} = \\dfrac{E}{t} $$`,
				'=',
				Round(k0, 4),
				' N/mm³',
			]);
		} else if (layer.type === 'CBR') {
			k0 = 0.007789 * Math.pow(layer.value, 0.7643);
			k.push(k0);

			doc.write([
				'Modulus of subgrade from California bearing ratio:',
				`$$ k_{${idx}} = 0.007789 \\cdot CBR^{0.7643} $$`,
				'=',
				Round(k0, 4),
				' N/mm³',
			]);
		} else if (layer.type === 'Longterm comp') {
			// Strength in kPa, thick in mm.

			k0 = (layer.value / (0.02 * layer.thickness)) * 1e-3;
			k.push(k0);

			doc.write([
				'Modulus of subgrade from long-term compressive strength:',
				`$$ k_{${idx}} = \\dfrac{\\sigma_{lt}}{0.02 t} = $$`,
				Round(k0, 4),
				' N/mm³',
			]);
		} else if (layer.type === 'EV') {
			// Ev2 in MPa, Ev_ratio is unitless.

			let Ev2 = layer.value;
			let Ev_ratio = layer.value2;

			k0 = Ev2 / (550 * Ev_ratio);

			k.push(k0);

			doc.write([
				'Modulus of subgrade from strain modulus:', //
				`$$ k_{${idx}} = \\dfrac{E_{V2}}{550 \\frac{E_{V2}}{E_{V1}}} = $$`,
				Round(k0, 4),
				' N/mm³',
			]);
		} else {
			k0 = layer.value;
			k.push(k0);
			doc.write([
				'Predefined modulus of subgrade: ',
				`$$ k_{${idx}} = $$ `,
				Round(k0, 4),
				' N/mm³',
			]);
		}

		if (layer.type === 'Longterm comp' || layer.type === 'E-modulus') {
			// if it is an isulation layer - only option with 'long term comp'

			let name = layer.insulation_type;
			let factor = 1;
			let EDP_A1A3 = 1;
			let EPD_A1D = 1;
			let link = 'Unavailable';

			if (name.includes('Sundolitt XPS')) {
				link = linkWrapper(
					'https://www.sundolitt.com/globalassets/inriver/resources/epd-xps-english-0822.pdf'
				);
				EDP_A1A3 = 3.7; // GWP per m2
				EPD_A1D = 7.21; // GWP per m2

				factor = layer.thickness / 33;
				let quality = name.split('Sundolitt XPS')[1];

				switch (quality) {
					case '200':
						factor *= 0.9;
						break;
					case '250':
						factor *= 1;
						break;
					case '300':
						factor *= 1;
						break;
					case '400':
						factor *= 1.1;
						break;
					case '500':
						factor *= 1.2;
						break;
					case '700':
						factor *= 1.3;
						break;
					default:
						factor *= 1;
						console.log('XPS type not found! 🤡');
				}
			} else if (name.includes('Sundolitt C')) {
				link = linkWrapper('https://www.epddanmark.dk/media/1a2jhz3y/md-22132-en.pdf');
				EDP_A1A3 = 1.12; //1.35; // GWP per m2
				EPD_A1D = 2.17; // inceneration* // 2.39; // GWP per m2

				factor = layer.thickness / 38;

				let quality = name.split('Sundolitt C')[1];
				switch (quality) {
					case '60':
						factor *= 0.8;
						break;
					case '80':
						factor *= 1;
						break;
					default:
						factor *= 1;
						console.log('C type not found! 🤡');
				}
			} else if (name.includes('Sundolitt S')) {
				link = linkWrapper('https://www.epddanmark.dk/media/1a2jhz3y/md-22132-en.pdf');
				EDP_A1A3 = 1.23; //1.59; // GWP per m2
				EPD_A1D = 2.41; // inceneration 2.77; // GWP per m2

				factor = layer.thickness / 38;

				let quality = name.split('Sundolitt S')[1];
				switch (quality) {
					case '60':
						factor *= 0.9;
						break;
					case '70':
						factor *= 0.95;
						break;
					case '80':
						factor *= 1;
						break;
					case '100':
						factor *= 1.25;
						break;
					case '150':
						factor *= 1.6;
						break;
					case '200MX':
						factor *= 2.0;
						break;
					case '250MX':
						factor *= 2.3;
						break;
					case '300MX':
						factor *= 2.8;
						break;
					case '400MX':
						factor *= 3.4;
						break;
					default:
						factor *= 1;
						console.log('S type not found! 🤡');
				}
			}

			insulation_layers.push({
				name: name,
				thickness: layer.thickness,
				factor: factor,
				EDP_A1A3: EDP_A1A3,
				EPD_A1D: EPD_A1D,
				EPD_link: link,
			});
		}

		inv_sum += 1 / k0;
		idx++;
	});

	let k_total = 1 / inv_sum;

	doc.write([
		'Resulting total modulus of subgrade:',
		'$$ k = \\left( \\sum_{i=1}^{N} \\dfrac{1}{k_{i}} \\right)^{-1} = $$',
		Round(k_total, 4),
		' N/mm³',
	]);

	// doc.write(['Coefficient of friction', '$$ \\mu $$', '=', Round(friction, 3)]);

	return {
		k_values: k,
		doc,
		k: k_total,
		friction: friction,
		insulation_layers,
	};
}

export type subbaseInput =
	| {
			name: string;
			type: 'CBR' | 'direct';
			thickness: number;
			value: number;
	  }
	| {
			name: string;
			type: 'EV';
			value: number;
			value2: number;
	  }
	| {
			name: string;
			type: 'E-modulus' | 'Longterm comp';
			value: number;
			thickness: number;
			insulation_type: string;
			lambda: number;
	  };

type insulationLayer = {
	name: string;
	thickness: number;
	factor: number;
	EDP_A1A3: number;
	EPD_A1D: number;
	EPD_link: string;
};
