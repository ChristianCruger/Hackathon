import { Round } from './helper_functions.js';
import docWriter from './DocWriter.js';

export default class EC_CS {
	// Eurocode creep & shrinkage
	eps_cd0: number;
	eps_ca_inf: number;
	#t0: number;
	#h0: number;
	#k_h: number;
	doc: docWriter;

	refCreep: number;
	#adjTime: number;
	#BH: number;

	constructor(
		concrete: { RH: number; class: string; f_ck: number; f_cm: number },
		referenceThickness: number,
		pouringTime: number,
		eps0: number = undefined
	) {
		this.doc = new docWriter();

		this.doc.writeTitle('Shrinkage calculations according to EN1992-1-1 §3.1.4');

		this.#t0 = pouringTime; // days
		this.#h0 = referenceThickness; // mm

		let concreteClass = concrete.class;

		let fck = concrete.f_ck; // !!!!!!!!
		let fcm = concrete.f_cm;

		if (eps0 !== undefined) {
			// reference drying shrinkage known
			this.eps_cd0 = eps0;
			this.doc.write([`Concrete Class: ${concreteClass}`]);

			this.doc.write([
				'User-defined basic drying shrinkage:',
				'$$ \\varepsilon_{cd,0} = $$',
				Round(this.eps_cd0 * 1000, 3),
				'‰',
			]);
		} else {
			// reference drying shrinkage unknown:
			let alpha_1 = 3;
			if (concreteClass === 'N') {
				alpha_1 = 4;
			} else if (concreteClass === 'R') {
				alpha_1 = 6;
			}

			let alpha_2 = 0.13;
			if (concreteClass === 'N') {
				alpha_2 = 0.12;
			} else if (concreteClass === 'R') {
				alpha_2 = 0.11;
			}

			this.doc.rowWidth = [20, 20, 20];
			this.doc.allignChildren = ['left', 'left', 'left'];
			this.doc.write([
				'Concrete Class ' + concreteClass + ':',
				`$$ \\alpha_{ds1} = ${alpha_1} $$`,
				`$$ \\alpha_{ds2} = ${alpha_2} $$`,
			]);

			this.doc.write(['Relative humidity:', '$$ RH = $$', concrete.RH, '%']);
			// 123

			this.doc.rowWidth = [20, 30, 5, 5, 5];
			this.doc.allignChildren = ['left', 'left', 'center', 'right', 'left'];

			let beta = 1.55 * (1 - Math.pow(concrete.RH / 100, 3));

			this.doc.write([
				'Humidity factor:',
				'$$ \\beta_{RH} = 1.55 \\left[ 1 - \\left( \\frac{RH}{100\\%} \\right)^3 \\right] = $$',
				Round(beta, 3),
				'',
			]);

			this.eps_cd0 = 0.85 * ((220 + 110 * alpha_1) * Math.exp((-alpha_2 * fcm) / 10)) * 1e-6 * beta;

			this.doc.write([
				'Basic drying shrinkage:',
				'$$ \\varepsilon_{cd,0} = 0.85 \\left[ \\left( 220 +  110 \\alpha_{ds1} \\right) \\cdot \\exp \\left( - \\alpha_{ds2} \\frac{f_{cm}}{10 \\text{MPa}} \\right) \\right] \\cdot 10^{-6} \\beta_{RH} = $$',
				// Round(this.eps_cd0 * 1000, 3),
				// '‰',
				'',
				'',
			]);

			this.doc.write(['', '', Round(this.eps_cd0 * 1000, 3), '‰']);
		}

		let h0 = this.#h0;

		if (h0 <= 100) {
			this.#k_h = 1;
		} else if (h0 <= 200) {
			this.#k_h = 1 - (0.15 * (h0 - 100)) / 100;
		} else if (h0 <= 300) {
			this.#k_h = 0.85 - (0.1 * (h0 - 200)) / 100;
		} else if (h0 <= 500) {
			this.#k_h = 0.75 - (0.05 * (h0 - 300)) / 200;
		} else {
			this.#k_h = 0.7;
		}

		this.doc.write(['Notional size:', '$$ h_0 = $$  ', h0, 'mm']);
		this.doc.write(['Size cofficient:', '$$ k_h = $$ ', Round(this.#k_h, 3), '']);

		this.doc.write([
			'Age factor:',
			'$$ \\beta_{ds} = \\frac{t - t_s}{t - t_s + 0.04 \\sqrt{h_0^3} } $$ ',
			'',
			'',
		]);

		this.doc.lineBreak();
		// this.doc.write('Autogenous shrinkage:');
		this.eps_ca_inf = 2.5 * (fck - 10) * 1e-6;

		this.doc.write([
			'Reference autogenous shrinkage:',
			'$$ \\varepsilon_{ca}(\\infty) = 2.5 \\left(f_{ck} - 10 \\text{MPa} \\right) \\cdot 10^{-6} = $$',
			Round(this.eps_ca_inf * 1000, 3),
			'‰',
		]);

		this.doc.write([
			'Autogenous development factor:',
			'$$ \\beta_{as}(t) = 1 - \\exp \\left(-0.2 t^{0.5} \\right) $$',
			'',
			'',
		]);

		this.doc.write([
			'Autogenous shrinkage:',
			'$$ \\varepsilon_{ca}(t) = \\beta_{as}(t) \\varepsilon_{ca}(\\infty) $$',
			'',
			'',
		]);

		// creep

		let a1 = 1;
		let a2 = 1;
		let a3 = 1;
		if (fcm > 35) {
			a1 = Math.pow(35 / fcm, 0.7);
			a2 = Math.pow(35 / fcm, 0.2);
			a3 = Math.pow(35 / fcm, 0.5);
		}

		// let temp = 20 //deg C
		// let t_T = Math.exp(- (4000/(273+temp)))

		let alpha = -1;
		if (concreteClass === 'N') {
			alpha = 0;
		} else if (concreteClass === 'R') {
			alpha = 1;
		}

		let t_0T = pouringTime;
		this.#adjTime = Math.max(0.5, t_0T * Math.pow(9 / (2 + Math.pow(t_0T, 1.2)) + 1, alpha));

		let phi_RH = (1 + ((1 - concrete.RH / 100) / (0.1 * Math.pow(h0, 0.333))) * a1) * a2;

		let B = 16.8 / Math.pow(fcm, 0.5);

		let B_t = 1 / (0.1 + Math.pow(this.#adjTime, 0.2));

		this.refCreep = phi_RH * B * B_t;

		this.#BH = Math.min(1.5 * (1 + Math.pow(0.012 * concrete.RH, 18)) * h0 + 250 * a3, 1500 * a3);
	}

	creep(time: number) {
		// console.log(`creep(t=${time}) = ${this.refCreep * this.#beta_c(time)}`);
		return this.refCreep * this.#beta_c(time);
	}

	#beta_c(time: number) {
		// expression (B.7)

		let t0 = this.#adjTime;
		let B_c = Math.pow((time - t0) / (this.#BH + time - t0), 0.3);

		return B_c;
	}

	#beta_ds(time: number) {
		let t0 = this.#t0;
		let t = time;
		let h0 = this.#h0;
		let delta_t = t - t0;

		return delta_t / (delta_t + 0.04 * Math.sqrt(Math.pow(h0, 3)));
	}

	dryingShrink(time: number) {
		return this.#beta_ds(time) * this.#k_h * this.eps_cd0;
	}

	#beta_as(time: number) {
		return 1 - Math.exp(-0.2 * Math.sqrt(time));
	}

	autogeniousShrink(time: number) {
		return this.#beta_as(time) * this.eps_ca_inf;
	}

	totalShrink(time: number) {
		return this.dryingShrink(time) + this.autogeniousShrink(time);
	}
}
