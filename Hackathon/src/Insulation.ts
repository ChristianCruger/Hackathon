import { subbaseInput } from './subbase';
import { Round } from './helper_functions.js';
import docWriter from './DocWriter.js';

export default function Insulation(slabThickness: number, subbaseArray: subbaseInput[]) {
	let doc = new docWriter();

	let R_total = 0;
	let R_inside = 0.17;
	let R_outside = 1.5;

	doc.writeTitleTwo('Insulation calculation', false);

	doc.rowWidth = [25, 20, 5, 5, 5];
	doc.allignChildren = ['left', 'left', 'center', 'right', 'left'];

	doc.write([
		'Transfer insulation: Upper surface',
		'$$ R_{upper} = $$',
		Round(R_inside, 3),
		'm²K/W',
	]);
	R_total += R_inside;

	let lambda_concrete = 2.5;
	let R_conc = slabThickness / 1000 / lambda_concrete;

	doc.write([
		'Concrete insulation',
		'$$ R_{concrete} = \\frac{t}{ \\lambda_{concrete} } = $$',
		Round(R_conc, 3),
		'm²K/W',
	]);
	R_total += R_conc;

	let i = 1;
	subbaseArray.forEach((layer) => {
		if (layer.lambda > 0) {
			let lambda = layer.lambda;

			if (layer.insulation_type.includes('Sundolitt XPS')) {
				// hard coded non-linear XPS insulation.
				let delta_t = layer.thickness - 100;
				let d_lam = Math.max(0.002, (delta_t / 50) * 0.002);
				if (delta_t < 0) d_lam = Math.max(-0.006, (delta_t / 50) * 0.005);

				lambda = lambda + d_lam;
			}

			let R_i = layer.thickness / 1000 / lambda;

			doc.write([
				`Insulation of ${layer.name}`,
				`$$ R_{${i}} = \\frac{ t_{${i}} }{\\lambda_{${i}}} = $$`,
				Round(R_i, 3),
				'm²K/W',
			]);

			R_total += R_i;
		}
		i++;
	});

	doc.write([
		'Transfer insulation: Lower surface',
		'$$ R_{lower} = $$',
		Round(R_outside, 3),
		'm²K/W',
	]);
	R_total += R_outside;

	doc.write([
		'Total insulation',
		'$$ R_{total} = \\sum_{i=1}^n R_i = $$',
		Round(R_total, 3),
		'm²K/W',
	]);

	let Uvalue = 1 / R_total;
	doc.write([
		'Total U-value',
		'$$ U = \\left( R_{total} \\right)^{-1} = $$',
		Round(Uvalue, 3),
		'W/m²K',
	]);

	return {
		doc,
		Uvalue,
	};
}
