// Library of different materials: Steel, Concrete and FibresCon
import docWriter from './DocWriter.js';
import { Round, opWr, linkWrapper } from './helper_functions.js';

export class Steel {
	f_yk: number;
	f_uk: number;
	class: 'A' | 'B' | 'C';
	strain_harden: boolean;
	name: string;
	E_s: number;
	dens: number;
	eps_uk: number;
	eps_ud: number;
	eps_yk: number;

	EPD_A1A3: number;
	EPD_A1D: number;
	EPD_link: string;

	constructor(f_yk: number, Ductility_Class: 'A' | 'B' | 'C' = 'B', Strain_harden = true) {
		// Eurocode Reinforcement Steel matrial type object - defines default properties from f_yk and the ductility Class
		this.f_yk = f_yk;
		this.class = Ductility_Class;
		this.strain_harden = Strain_harden;
		this.name = Round(f_yk) + Ductility_Class;
		this.E_s = 200e3; // MPa
		this.dens = 7850; // kg/m3

		// EN1992-1-1 Annex C
		if (Ductility_Class == 'A') {
			this.eps_uk = 0.025;
			this.f_uk = 1.05 * this.f_yk;
		} else if (Ductility_Class == 'B') {
			this.eps_uk = 0.07;
			this.f_uk = 1.08 * this.f_yk;
		} else if (Ductility_Class == 'C') {
			this.eps_uk = 0.075;
			this.f_uk = 1.15 * this.f_yk;
		} else {
			console.warn('Invalid steel Ductility_Class!');
		}

		this.eps_ud = 0.9 * this.eps_uk; // EC recommended

		this.eps_yk = this.f_yk / this.E_s;

		this.EPD_A1A3 = 445; // 773 - LeMu
		this.EPD_A1D = 584;
		this.EPD_link = linkWrapper(
			'https://api.environdec.com/api/v1/EPDLibrary/Files/b8f8bd47-8c39-480b-3a09-08d98fadb225/Data'
		);
		// https://api.environdec.com/api/v1/EPDLibrary/Files/7be92065-00d7-45b3-803e-08d941d5f1c9/Data
	}

	// Dependant parameters:
	f_ud = function (gamma: number) {
		return this.f_uk / gamma;
	};

	f_yd = function (gamma: number) {
		return this.f_yk / gamma;
	};

	eps_yd = function (gamma: number) {
		return this.f_yd(gamma) / this.E_s;
	};

	// ---------------------- METHODS ----------------------
	// Stress strain function in material def
	stress_strain = function (eps: number, gamma: number, Strain_harden = this.strain_harden) {
		// Parabolic stress-strain function
		// Returns a stress value [MPa] for a given strain input [-]

		let sigma = 0;

		if (Strain_harden) {
			// Allow for strain hardening after yielding:

			if (eps <= -this.eps_yd(gamma)) {
				// compression yielding ??
				sigma = -this.f_yd(gamma);
			} else if (eps <= this.eps_yd(gamma)) {
				// elastic phase
				sigma = eps * this.E_s;
			} else if (eps < this.eps_ud) {
				sigma =
					this.f_yd(gamma) +
					((eps - this.eps_yd(gamma)) / (this.eps_ud - this.eps_yd(gamma))) *
						(this.f_ud(gamma) - this.f_yd(gamma));
			} else {
				sigma =
					this.f_ud(gamma) +
					((eps - this.eps_yd(gamma)) / (this.eps_ud - this.eps_yd(gamma))) *
						(this.f_ud(gamma) - this.f_yd(gamma));
				// console.warn('steel tensile limit exceeded')
			}
		} else {
			// Perfectly plastic:
			sigma = Math.min(eps * this.E_s, this.f_yd(gamma) + (eps - this.eps_yd(gamma)) * 10); // minor stiffness to help convergence
		}

		// output:
		return sigma;
	};

	documentation = function () {
		// print important values of concrete material
		let Output = [];
		// Output.push('Selected steel: ' + this.name);
		// Output.push('\\( f_{yk} = ' + Round(this.f_yk, 0) + ' \\text{ MPa} \\)');
		// Output.push('\\( E_{s} = ' + Round(this.E_s, 0) + ' \\text{ MPa} \\)');

		Output.push(`Selected steel: ${this.name},
			\\( f_{yk} = \\) ${Round(this.f_yk, 0)} MPa,
			\\( E_{s} = \\) ${Round(this.E_s, 0)} MPa`);

		return Output;
	};

	CO2 = function (tonneOfSteel: number, level = 1) {
		// per ton of steel

		if (level === 1) return tonneOfSteel * this.EPD_A1A3;

		return tonneOfSteel * this.EPD_A1D;
	};
}

// *****************************************************************************************************************

export class EC_Concrete {
	// properties:
	class: 'S' | 'N' | 'R';
	name: string;
	RH: number;
	stress_strain_function: string;
	alpha_cc: number;
	alpha_ct: number;
	creep: number;
	density: number;
	poisson: number;
	NA: string;
	D_lower: number;
	D_upper: number;
	f_cm: number;
	f_ctm: number;
	f_ctk: number;
	E: number;
	eps_c1: number;
	eps_cu1: number;
	eps_c2: number;
	eps_cu2: number;
	n: number;
	eps_c3: number;
	eps_cu3: number;

	refAge: number;

	// private properties:
	#f_ck_val: number; // private property to store f_ck value
	#s: number;

	//EPD
	EPD_A1A3: number;
	EPD_A1D: number;
	// EPD_link: string;
	#lowCO2_val: boolean;

	constructor(
		f_ck: number,
		selected_NA = '',
		stress_strain_function = 'parabolic',
		concreteClass: 'S' | 'N' | 'R' = 'N',
		RH = 50
	) {
		// Eurocode concrete matrial type object - defines default properties from f_ck
		// Strength (EN1992-1-1 Table 3.1)
		this.class = concreteClass;
		this.RH = RH; // relative humidity %
		this.f_ck = Number(f_ck);

		// move to shrinkage??
		if (this.class === 'S') {
			this.#s = 0.38;
		} else if (this.class === 'N') {
			this.#s = 0.25;
		} else if (this.class === 'R') {
			this.#s = 0.2;
		}

		this.refAge = 28;
		// EPD
		this.lowCO2 = false;

		this.stress_strain_function = stress_strain_function;
		this.alpha_cc = 1.0;
		this.alpha_ct = 1.0;
		this.creep = 0; // creep factor
		this.density = 24; // kN/m3

		this.poisson = 0.2;

		this.NA = selected_NA;

		this.D_lower = 8; // [mm] min aggregate size (limit of EN1992-1-1 to cover)
		this.D_upper = 30; // [mm] max aggregate size
	}

	set lowCO2(choice: boolean) {
		// set CO2 emmision data based on lowCO2 option:
		// (best fit polynominal based on EPDs)
		let f_ck = this.#f_ck_val;
		if (choice === false) {
			// normal

			this.EPD_A1A3 = Math.max(188, Math.min(432, 0.3078 * f_ck ** 2 - 6.8788 * f_ck + 219.47));
			this.EPD_A1D = Math.max(203, Math.min(449, 0.298 * f_ck ** 2 - 6.0816 * f_ck + 222.75));
		} else {
			// futureCEM
			this.EPD_A1A3 = Math.max(160, Math.min(227, 0.0784 * f_ck ** 2 + 1.0987 * f_ck + 123.01));
			this.EPD_A1D = Math.max(178, Math.min(245, 0.0814 * f_ck ** 2 + 1.0811 * f_ck + 139.53));
		}

		this.#lowCO2_val = choice;
	}

	get lowCO2() {
		return this.#lowCO2_val;
	}

	get EPD_link() {
		// return link to EPD based on fck value

		let link = 'link not available';

		let DB: { class: number; link: string }[] = [
			{ class: 16, link: linkWrapper('https://www.epddanmark.dk/media/t1ge0gnr/md-22090-da.pdf') },
			{ class: 20, link: linkWrapper('https://www.epddanmark.dk/media/unajvaoe/md-22091-da.pdf') },
			{
				class: 25,
				link: linkWrapper('https://www.epddanmark.dk/media/bzln31ik/md-21021-da_unicon.pdf'),
			},
			{
				class: 30,
				link: linkWrapper('https://www.epddanmark.dk/media/kfceit4y/md-21026-da_unicon.pdf'),
			},
			{
				class: 35,
				link: linkWrapper('https://www.epddanmark.dk/media/kpebfw44/md-21024-da_rev1.pdf'),
			},
			{
				class: 40,
				link: linkWrapper('https://www.epddanmark.dk/media/axrlfnga/md-21025-da_unicon.pdf'),
			},
		];

		if (this.lowCO2) {
			DB = [
				{
					class: 16,
					link: linkWrapper('https://www.epddanmark.dk/media/jufkifzq/md-22092-da.pdf'),
				},
				{
					class: 20,
					link: linkWrapper('https://www.epddanmark.dk/media/ksgclghy/md-22093-da.pdf'),
				},
				{
					class: 25,
					link: linkWrapper('https://www.epddanmark.dk/media/dovcgbn4/md-21108-da.pdf'),
				},
				{
					class: 30,
					link: linkWrapper('https://www.epddanmark.dk/media/dkclcn3n/md-21109-da.pdf'),
				},
			];
		}

		let fck = this.#f_ck_val;

		let last = DB.length - 1;
		if (fck < DB[0].class) {
			link = `C${fck} based C${DB[0].class}: ` + DB[0].link;
		} else if (fck > DB[DB.length - 1][0]) {
			link = `C${fck} based on C${DB[last].class}: ` + DB[last].link;
		} else {
			for (let i = 0; i < DB.length; i++) {
				let prev = Math.max(0, i - 1);
				if (fck === DB[i].class) {
					link = `C${fck}: ` + DB[i].link;
				} else if (fck > DB[prev].class && fck < DB[i].class) {
					link =
						`C${fck}: Interpolated between` +
						`<br> C${DB[prev].class} : ` +
						DB[prev].link +
						' <br> ' +
						`C${DB[i].class}: ` +
						DB[i].link;
				}
			}
		}

		return link;
	}
	set f_ck(f_ck) {
		// parameters that dependt on strength:

		this.#f_ck_val = f_ck;
		this.f_cm = f_ck + 8;
		this.name = 'C' + f_ck;

		if (f_ck <= 50) {
			this.f_ctm = 0.3 * Math.pow(f_ck, 2 / 3);
		} else {
			this.f_ctm = 2.12 * Math.log(1 + this.f_cm / 10);
		}

		this.f_ctk = 0.7 * this.f_ctm;
		this.E = 22 * Math.pow(this.f_cm / 10, 0.3) * 1000; // MPa

		// strain limits:   // how is this impacted by creep????
		// EN1992-1-1: Table 3.1
		this.eps_c1 = Math.min(0.7 * Math.pow(this.f_cm, 0.31), 2.8) / 1000;
		this.eps_cu1 = Math.min(3.5, 2.8 + 27 * Math.pow((98 - this.f_cm) / 100, 4)) / 1000; // updated in prEN1992!
		this.eps_c2 = (2.0 + 0.085 * Math.pow(Math.max(0, f_ck - 50), 0.53)) / 1000;
		this.eps_cu2 = Math.min(3.5, 2.6 + 35 * Math.pow((90 - f_ck) / 100, 4)) / 1000;
		this.n = Math.min(2.0, 1.4 + 23.4 * Math.pow((90 - f_ck) / 100, 4));
		this.eps_c3 = Math.max(1.75, 1.75 + 0.55 * ((f_ck - 50) / 40)) / 1000;
		this.eps_cu3 = Math.min(3.5, 2.6 + 35 * Math.pow((90 - f_ck) / 100, 4)) / 1000;
	}

	get f_ck() {
		return this.#f_ck_val;
	}

	get Ec_eff() {
		return this.E / (1 + this.creep);
	}

	// Dependant on Partial coefficient:
	f_ctd = function (gamma_ct: number, alpha = this.alpha_ct) {
		if (this.refAge === 28) return (alpha * this.f_ctk) / gamma_ct;
		else {
			let fctk = 0.7 * this.f_ctm_time(this.refAge);
			return (alpha * fctk) / gamma_ct;
		}
	};

	eps_cr = function (gamma_cc: number, gamma_ct, Type = this.stress_strain_function) {
		if (Type == 'elastic') return 1e10; // unbreakable!

		return this.f_ctd(gamma_ct) / this.E_eqv(gamma_cc, Type); // ad-hoc solution
	};

	f_cd = function (gamma: number, alpha = this.alpha_cc) {
		if (this.refAge === 28) return (alpha * this.f_ck) / gamma;
		else {
			let fck = this.f_cm_time(this.refAge) - 8;
			return (alpha * fck) / gamma;
		}
	};

	E_eqv = function (gamma: number, Type = this.stress_strain_function) {
		// equevalent E mod, corresponding to stress/strain function

		if (Type == 'parabolic') {
			let E = (this.n * this.f_cd(gamma)) / this.eps_c2;
			return E;
		} else if (Type == 'bi-linear') {
			return this.f_cd(gamma) / this.eps_c3;
		} else {
			return this.Ec_eff;
		}
	};

	beta_cc = function (days: number) {
		return Math.exp(this.#s * (1 - Math.sqrt(28 / days)));
	};

	f_cm_time = function (days: number) {
		return this.f_cm * this.beta_cc(days);
	};

	f_ctm_time = function (days = this.refAge) {
		let alpha = 1;
		if (days >= 28) alpha = 2 / 3;

		return this.f_ctm * Math.pow(this.beta_cc(days), alpha);
	};

	E_cm_time = function (days: number) {
		return this.E * Math.pow(this.f_cm_time(days) / this.f_cm, 0.3);
	};
	// ----------------------METHODS ----------------------
	// Stress strain function in material def
	stress_strain = function (eps: number, gamma_c: number, Type = this.stress_strain_function) {
		// Parabolic stress-strain function
		// Returns a stress value [MPa] for a given strain input [-]

		// default: Linear:
		let sigma = eps * this.Ec_eff;

		if (Type === 'parabolic') {
			if (eps > 0) {
				// sigma = -this.stress_strain(-eps, gamma_c, Type); // inverse curve in tension                     // how is this effected by creep????

				sigma = eps * this.E_eqv(gamma_c, Type);
				// no reduction (sigma = 0) at cracking to help convergence!
			} else if (eps > -this.eps_c2) {
				sigma = -this.f_cd(gamma_c) * (1 - Math.pow(1 - eps / -this.eps_c2, this.n));
			} else if (eps > -this.eps_cu2) {
				sigma = -this.f_cd(gamma_c); // -eps*10
			} else {
				sigma = -this.f_cd(gamma_c); // -eps*10 //- (-eps-this.eps_c2)*100
			}
		} else if (Type === 'bi-linear') {
			if (eps > 0) {
				sigma = -this.stress_strain(-eps); // how is this effected by creep????

				sigma = eps * this.E_eqv(gamma_c, Type);
			} else if (eps > -this.eps_c3) {
				sigma = -this.f_cd(gamma_c) * (eps / -this.eps_c3);
			} else {
				sigma = -this.f_cd(gamma_c); //- (-eps-this.eps_c3)*100
			}
		} else if (Type === 'block') {
			if (eps > 0) {
				sigma = -this.stress_strain(-eps, gamma_c, Type); // inverse curve in tension                     // how is this effected by creep????
			} else if (eps > -0.2 * this.eps_cu3) {
				sigma = 0;
			} else {
				sigma = -this.f_cd(gamma_c); //- (-eps-this.eps_c3)*100
			}
		} else if (Type === 'complex') {
			// Latest as per prEN1992 - NOT YET CHECKED! - ecu1 value changed in prEN1992!
			if (eps > 0) {
				sigma = -this.stress_strain(-eps, gamma_c, Type); // inverse curve in tension
			} else {
				let k = (1.05 * this.E * this.eps_c1) / this.f_cm;
				let eta = -eps / this.eps_c1;
				sigma = (-this.f_cm * (k * eta - eta * eta)) / (1 + eta * (k - 2));
			}
		}

		// output:
		return sigma;
	};

	documentation = function () {
		// print important values of concrete material
		let Output = [];

		Output.push(`Selected concrete: ${this.name}, 
			\\( f_{ck} = \\) ${Round(this.f_ck, 0)} MPa,
			\\( E_{cm} = \\) ${Round(this.Ec_eff, 0)} MPa,
			\\( f_{ctm} = \\) ${Round(this.f_ctm, 2)} MPa`);

		if (this.refAge !== 28) {
			Output.push(
				`Utilizing increased ${
					this.refAge
				} day strenght: Increased by a factor of \\( \\beta_{cc} = \\) ${Round(
					this.beta_cc(this.refAge),
					2
				)} `
			);
		}
		return Output;
	};

	CO2 = function (concreteVolume: number, level = 1) {
		// per m3 of concrete

		if (level === 1) return concreteVolume * this.EPD_A1A3;

		return concreteVolume * this.EPD_A1D;
	};
}

export class DURUS_EasyFinish {
	content: number;
	fiberType: 'synthetic' | 'steel' | 'custom';
	manufacturer: string;
	name: string;
	Code: string;
	contentString: string;

	warnString: string;

	k: number;
	// kG: number; - changed to setter

	// residual strenghs:
	f_R1: number;
	f_R2: number;
	f_R3: number;
	f_R4: number;
	f_R1k: number;
	f_R2k: number;
	f_R3k: number;
	f_R4k: number;

	// Class: string;
	l_f: number;
	w_s: number;
	w_u: number;

	density: number;

	EPD_A1A3: number;
	EPD_A1D: number;
	EPD_link: string;

	#kG_max: number;
	#kG_actual: number;

	constructor(Content: string, selected_code: string) {
		// ADFIL DURUS EasyFinish fibre type object - defined properties from fibre content [kg/m3]

		this.fiberType = 'synthetic';
		this.manufacturer = 'ADFIL';
		this.name = 'DURUS® EasyFinish';
		this.content = Number(Content); // kg/m3

		this.contentString = Content + 'kg/m³ ' + this.name;
		this.warnString = '';

		this.Code = selected_code;

		this.k = 1.0; // Orientation factor: 0.5 < k < 2
		this.density = 922; // kg/m3

		// EPD
		this.EPD_A1A3 = 1.95;
		this.EPD_A1D = 2.11;
		this.EPD_link = linkWrapper('https://www.epddanmark.dk/media/e2rbzqnl/md-20010-en_adfil.pdf');

		if (Content == '2') {
			// Mean
			this.f_R1 = 1.21;
			this.f_R2 = 1.11;
			this.f_R3 = 1.2;
			this.f_R4 = 1.16;
			// Characteristic
			this.f_R1k = 0.84;
			this.f_R2k = 0.68;
			this.f_R3k = 0.7;
			this.f_R4k = 0.67;
		} else if (Content == '2.5') {
			this.f_R1 = 1.52;
			this.f_R2 = 1.91;
			this.f_R3 = 1.99;
			this.f_R4 = 1.95;
			// Characteristic
			this.f_R1k = 1.15;
			this.f_R2k = 1.38;
			this.f_R3k = 1.42;
			this.f_R4k = 1.4;
		} else if (Content == '3') {
			this.f_R1 = 1.51;
			this.f_R2 = 1.62;
			this.f_R3 = 1.8;
			this.f_R4 = 1.8;
			// Characteristic
			this.f_R1k = 1.25;
			this.f_R2k = 1.25;
			this.f_R3k = 1.34;
			this.f_R4k = 1.29;
		} else if (Content == '4') {
			this.f_R1 = 1.8;
			this.f_R2 = 1.9;
			this.f_R3 = 2.1;
			this.f_R4 = 2;
			// Characteristic
			this.f_R1k = 1.45;
			this.f_R2k = 1.5;
			this.f_R3k = 1.66;
			this.f_R4k = 1.55;
		} else if (Content == '5') {
			this.f_R1 = 2;
			this.f_R2 = 2.5;
			this.f_R3 = 2.7;
			this.f_R4 = 2.6;
			// Characteristic
			this.f_R1k = 1.56;
			this.f_R2k = 1.78;
			this.f_R3k = 1.91;
			this.f_R4k = 1.88;
		} else if (Content == '6') {
			this.f_R1 = 2.3;
			this.f_R2 = 2.7;
			this.f_R3 = 2.9;
			this.f_R4 = 2.9;
			// Characteristic
			this.f_R1k = 1.79;
			this.f_R2k = 2.07;
			this.f_R3k = 2.31;
			this.f_R4k = 2.33;
		} else if (Content == '8') {
			this.f_R1 = 2.9;
			this.f_R2 = 3.5;
			this.f_R3 = 3.8;
			this.f_R4 = 3.9;
			// Characteristic
			this.f_R1k = 2.2;
			this.f_R2k = 2.62;
			this.f_R3k = 2.96;
			this.f_R4k = 3.04;
		} else if (Content == '10') {
			this.f_R1 = 3.3;
			this.f_R2 = 4.3;
			this.f_R3 = 4.7;
			this.f_R4 = 4.7;
			// Characteristic
			this.f_R1k = 2.52;
			this.f_R2k = 3.19;
			this.f_R3k = 3.5;
			this.f_R4k = 3.57;
		} else {
			// no fibres
			this.warnString += 'No valid fiber content entered';
			this.f_R1 = 0;
			this.f_R2 = 0;
			this.f_R3 = 0;
			this.f_R4 = 0;
			// Characteristic
			this.f_R1k = 0;
			this.f_R2k = 0;
			this.f_R3k = 0;
			this.f_R4k = 0;
		}
		if (this.f_R1 < 1.5 || this.f_R3 < 1.0) {
			this.warnString += 'Note: Current fiber dosage is below CE marked dosage.';
		}

		if (this.f_R1k > 0) {
			this.#kG_max = Math.min(
				(0.9 * this.f_R1) / this.f_R1k,
				(0.9 * this.f_R2) / this.f_R2k,
				(0.9 * this.f_R3) / this.f_R3k,
				(0.9 * this.f_R4) / this.f_R4k
			);
		}
		this.kG = 1.0; // factor for static indeterminism

		this.l_f = 40; // fibre length [mm]

		this.w_s = 0.5; // [mm] - crack opening at f_Fts
		this.w_u = 2.5; // [mm] crack mouth at f_Ftu
	}

	get Class() {
		let ratio = this.f_R3k / this.f_R1k;
		let F1 = Math.round((this.f_R1k + Number.EPSILON) * 10) / 10;

		if (ratio < 0.5) return 'Unclassified!';
		if (ratio < 0.7) return F1 + 'a';
		if (ratio < 0.9) return F1 + 'b';
		if (ratio < 1.1) return F1 + 'c';
		if (ratio < 1.3) return F1 + 'd';
		return F1 + 'e';
	}

	get kG() {
		return this.#kG_actual;
	}

	set kG(value: number) {
		this.#kG_actual = Math.min(this.#kG_max, value);

		// if (this.#kG_actual === this.#kG_max) console.log('kG reduced to not exceed 90% of mean value');
	}

	get f_Ftsk() {
		if (this.Code === 'fib') {
			return this.k * 0.45 * this.f_R1k;
		} else {
			// EC
			return this.k * 0.4 * this.f_R1k; // when to use 0.40? and when to use 0.37 ????
		}
	}

	get volumeFraction() {
		return this.content / this.density;
	}

	get f_Ftuk() {
		if (this.Code === 'fib') {
			return this.get_f_Ftuk(this.w_u);
		} else {
			// EC
			return this.k * (0.57 * this.f_R3k - 0.26 * this.f_R1k);
		}
	}

	assessDosage = function (ConcreteTensileStrength: number = undefined) {
		let volumeFraction = this.volumeFraction * 100;
		if (volumeFraction === 0) return '';

		let warning = this.warnString === '' ? '' : this.warnString + '<br> ';

		if (ConcreteTensileStrength !== undefined) {
			if (this.f_R1k < 0.5 * ConcreteTensileStrength) {
				warning +=
					'Fiber dosage too low for selected concrete strength \\( \\left( f_{R,1k} \\geq 0.5 f_{ctk,0.05} \\right) \\) <br>';
			}
		}

		let volStr = warning + `Volume fraction: \\( V_f = \\) ${Round(volumeFraction, 2)} % - `;
		if (volumeFraction < 0.25) {
			return volStr + 'Very little impact on concrete workability';
		} else if (volumeFraction < 0.45) {
			return volStr + 'Little impact on concrete workability';
		} else if (volumeFraction < 0.7) {
			return volStr + 'Modest impact on concrete workability. Consider measures to increase slump';
		} else if (volumeFraction < 1.1) {
			return volStr + 'High impact on concrete workability. Consider measures to increase slump';
		}

		return volStr + 'Very high impact on concrete workability. Consider measures to increase slump';
	};

	get_f_Ftuk = function (ulimate_crackwidth: number) {
		if (this.Code !== 'fib') {
			return console.error('Method only relevant for fib Model Code!');
		}

		return (
			this.k *
			Math.max(
				0,
				0.45 * this.f_R1k - (ulimate_crackwidth / 2.5) * (0.65 * this.f_R1k - 0.5 * this.f_R3k)
			)
		);
	};

	getStress = function (CMOD: number, gamma_m: number) {
		var f_F1d = (0.37 * this.f_R1k * this.#kG_actual) / gamma_m;
		var f_F3d = Math.max(
			1e-10,
			((0.57 * this.f_R3k - 0.26 * this.f_R1k) * this.#kG_actual) / gamma_m
		);

		if (this.Code === 'fib') {
			f_F1d = this.f_Ftsd(gamma_m);
			f_F3d = this.f_Ftud(gamma_m);
		}

		var stress = Math.max(
			1e-10,
			f_F1d + ((CMOD - this.w_s) / (this.w_u - this.w_s)) * (f_F3d - f_F1d)
		);

		return stress;
	};

	// methods:
	f_Ftsd = function (gamma: number, kG = this.#kG_actual): number {
		return (this.f_Ftsk * kG) / gamma;
	};

	f_Ftud = function (gamma: number, kG = this.#kG_actual): number {
		return (this.f_Ftuk * kG) / gamma;
	};

	documentation = function (characteristic = true) {
		// print important values of concrete material
		let Output = [];

		if (this.f_R1 === 0) {
			Output.push('No fibers selected');
		} else {
			// Output.push('Selected fibres: ' + this.contentString);
			if (characteristic) {
				Output.push(
					`Selected fibers: ${this.contentString}, \\( f_{R1k} = \\) ${Round(
						this.f_R1k,
						2
					)} MPa, \\( f_{R2k} = \\) ${Round(this.f_R2k, 2)} MPa, \\( f_{R3k} = \\) ${Round(
						this.f_R3k,
						2
					)} MPa, \\( f_{R4k} = \\) ${Round(this.f_R4k, 2)} MPa`
				);
			} else {
				Output.push(
					`Selected fibers: ${this.contentString}, \\( f_{R1} = \\) ${Round(
						this.f_R1,
						2
					)} MPa,\\( f_{R2} = \\) ${Round(this.f_R2, 2)} MPa, \\( f_{R3} = \\) ${Round(
						this.f_R3,
						2
					)} MPa, \\( f_{R4} = \\) ${Round(this.f_R4, 2)} MPa`
				);
			}

			if (this.k !== 1) {
				Output[0] += `<br> Orientation factor: \\( k_O  = \\) ${Round(this.k, 2)}`;
				// Output += opWr(4, Round(this.k, 2), 'Orientation factor', 'k_{O}', '');
			}

			if (this.kG !== 1 && characteristic) {
				Output[0] += `<br>Statically indeterminate factor: \\( k_G = \\) ${Round(
					this.#kG_actual,
					2
				)}`;
				if (this.#kG_actual === this.#kG_max)
					Output[0] += ` (\\( k_G \\) reduced to not exceed 90% of mean value)`;

				// Output.push(
				// 	opWr(4, Round(this.#kG_actual, 2), 'Statically indeterminate factor', 'k_{G}', '')
				// );
				// if (this.#kG_actual === this.#kG_max)
				// Output.push('\\( k_{G} \\) reduced to not exceed 90% of mean value');
			}

			if (this.warnString !== '') {
				Output[0] += `<br> ${this.warnString}`;
				// Output.push(this.warnString);
			}
		}

		return Output;
	};

	CO2 = function (concreteVolume: number, level = 1) {
		// per kg of fibers

		if (level === 1) return concreteVolume * this.content * this.EPD_A1A3;

		//else:	A1-D
		return concreteVolume * this.content * this.EPD_A1D;
	};
}

export class DURUS_S500 extends DURUS_EasyFinish {
	constructor(Content: string, selected_code: string) {
		super(Content, selected_code); // call original construction function

		this.name = 'DURUS® S500';

		this.EPD_link =
			'EPD Unavaible. Similar to DURUS EasyFinish: https://www.epddanmark.dk/media/e2rbzqnl/md-20010-en_adfil.pdf';

		// ADFIL DURUS S500 fibre type object - defined properties from fibre content [kg/m3]
		if (Content == '3') {
			this.f_R1 = 1.53;
			this.f_R2 = 1.76;
			this.f_R3 = 2.04;
			this.f_R4 = 2.02;
			// Characteristic
			this.f_R1k = 1.2;
			this.f_R2k = 1.29;
			this.f_R3k = 1.14;
			this.f_R4k = 1.16;
		} else if (Content == '5') {
			this.f_R1 = 1.6;
			this.f_R2 = 1.9;
			this.f_R3 = 2.1;
			this.f_R4 = 2.2;
			// Characteristic
			this.f_R1k = 1.38;
			this.f_R2k = 1.58;
			this.f_R3k = 1.71;
			this.f_R4k = 1.82;
		} else if (Content == '6') {
			this.f_R1 = 2.41;
			this.f_R2 = 2.99;
			this.f_R3 = 3.51;
			this.f_R4 = 3.56;
			// Characteristic
			this.f_R1k = 1.65;
			this.f_R2k = 1.78;
			this.f_R3k = 2.09;
			this.f_R4k = 2.17;
		} else if (Content == '8') {
			this.f_R1 = 2.4;
			this.f_R2 = 3.0;
			this.f_R3 = 3.4;
			this.f_R4 = 3.5;
			// Characteristic
			this.f_R1k = 2.04;
			this.f_R2k = 2.57;
			this.f_R3k = 2.89;
			this.f_R4k = 2.96;
		} else if (Content == '9') {
			this.f_R1 = 3.32;
			this.f_R2 = 4.27;
			this.f_R3 = 4.97;
			this.f_R4 = 5.11;
			// Characteristic
			this.f_R1k = 2.7;
			this.f_R2k = 3.38;
			this.f_R3k = 3.89;
			this.f_R4k = 4.12;
		} else {
			// no fibres
			console.warn('No valid fiber content entered');
			this.f_R1 = 0;
			this.f_R2 = 0;
			this.f_R3 = 0;
			this.f_R4 = 0;
			// Characteristic
			this.f_R1k = 0;
			this.f_R2k = 0;
			this.f_R3k = 0;
			this.f_R4k = 0;
		}
		if (this.f_R1 < 1.5 || this.f_R3 < 1.0) {
			this.warnString = 'Note: current fiber dosage does not adhere to CE requirements';
		}

		this.l_f = 55; // fibre length [mm]

		this.contentString = Content + 'kg/m³ ' + this.name + ' ' + this.l_f + 'mm';
	}
}

export class DURUS_FF32 extends DURUS_EasyFinish {
	constructor(Content: string, selected_code: string) {
		super(Content, selected_code); // call original construction function

		this.name = 'DURUS® FlooringFibre';

		this.EPD_link =
			'EPD Unavaible. Similar to DURUS EasyFinish: https://www.epddanmark.dk/media/e2rbzqnl/md-20010-en_adfil.pdf';

		// ADFIL DURUS FF32 fibre type object - defined properties from fibre content [kg/m3]
		if (Content == '3.2') {
			this.f_R1 = 1.49;
			this.f_R2 = 1.68;
			this.f_R3 = 1.63;
			this.f_R4 = 1.48;
			// Characteristic
			this.f_R1k = 1.07;
			this.f_R2k = 1.24;
			this.f_R3k = 1.16;
			this.f_R4k = 1.07;
		} else {
			// no fibres
			console.warn('No valid fiber content entered');
			this.f_R1 = 0;
			this.f_R2 = 0;
			this.f_R3 = 0;
			this.f_R4 = 0;
			// Characteristic
			this.f_R1k = 0;
			this.f_R2k = 0;
			this.f_R3k = 0;
			this.f_R4k = 0;
		}
		if (this.f_R1 < 1.5 || this.f_R3 < 1.0) {
			this.warnString = 'Note: current fiber dosage does not adhere to CE requirements';
		}

		this.density = 914; // [kg/m3]
		this.l_f = 32; // fibre length [mm]

		this.contentString = Content + 'kg/m³ ' + this.name + ' ' + this.l_f + 'mm';
	}
}

export class ADFIL_SF86 extends DURUS_EasyFinish {
	constructor(Content: string, selected_code: string) {
		super(Content, selected_code); // call original construction function

		this.manufacturer = 'ADFIL';
		this.name = 'ADFIL SF86';
		this.warnString = '';
		this.fiberType = 'steel';

		// EPD
		this.EPD_A1A3 = 0.933;
		this.EPD_A1D = 0.708;
		this.EPD_link = 'EPD Unavaible'; // based on Dramix

		// ADFIL DURUS S500 fibre type object - defined properties from fibre content [kg/m3]
		if (Content == '13.3') {
			this.f_R1 = 2.1;
			this.f_R2 = 2.2;
			this.f_R3 = 2.2;
			this.f_R4 = 2.0;
			// Characteristic
			this.f_R1k = 1.49;
			this.f_R2k = 1.43;
			this.f_R3k = 1.39;
			this.f_R4k = 1.24;
		} else if (Content == '26.6') {
			this.f_R1 = 3.7;
			this.f_R2 = 4.3;
			this.f_R3 = 4.3;
			this.f_R4 = 4.1;
			// Characteristic
			this.f_R1k = 2.83;
			this.f_R2k = 3.24;
			this.f_R3k = 3.29;
			this.f_R4k = 3.09;
		} else if (Content == '39.9') {
			this.f_R1 = 4.9;
			this.f_R2 = 5.6;
			this.f_R3 = 5.6;
			this.f_R4 = 5.2;
			// Characteristic
			this.f_R1k = 3.55;
			this.f_R2k = 3.95;
			this.f_R3k = 4.18;
			this.f_R4k = 3.96;
		} else {
			// no fibres
			console.warn('No valid fiber content entered');
			this.f_R1 = 0;
			this.f_R2 = 0;
			this.f_R3 = 0;
			this.f_R4 = 0;
			// Characteristic
			this.f_R1k = 0;
			this.f_R2k = 0;
			this.f_R3k = 0;
			this.f_R4k = 0;
		}

		if (this.f_R1 < 1.5 || this.f_R3 < 1.0) {
			this.warnString = 'Note: current fiber dosage does not adhere to CE requirements';
		}

		this.l_f = 62; // fibre length [mm]

		this.density = 7850; // [kg/m3]

		this.contentString = Content + 'kg/m³ ' + this.name + ' ' + this.l_f + 'mm';
	}
}

export class Custom_fiber extends DURUS_EasyFinish {
	constructor(
		Content: string,
		selected_code: string,
		userFiberData: {
			name: string;
			f_R1: number;
			f_R2: number;
			f_R3: number;
			f_R4: number;
			f_R1k: number;
			f_R2k: number;
			f_R3k: number;
			f_R4k: number;
			length: number;
			EPD_A1A3: number;
			EPD_A1D: number;
			EPD_link: string;
			density: number;
		}
	) {
		super('0', selected_code); // call original construction function

		this.content = Number(Content);
		this.name = userFiberData.name;
		this.fiberType = 'custom';
		this.manufacturer = 'unknown';
		this.Code = selected_code;

		this.EPD_A1A3 = userFiberData.EPD_A1A3;
		this.EPD_A1D = userFiberData.EPD_A1D;
		this.EPD_link = userFiberData.EPD_link;

		// custom fiber type
		this.f_R1 = userFiberData.f_R1;
		this.f_R2 = userFiberData.f_R2;
		this.f_R3 = userFiberData.f_R3;
		this.f_R4 = userFiberData.f_R4;
		// Characteristic
		this.f_R1k = userFiberData.f_R1k;
		this.f_R2k = userFiberData.f_R2k;
		this.f_R3k = userFiberData.f_R3k;
		this.f_R4k = userFiberData.f_R4k;

		// TODO: list all relevant standards to follow before implementing custom fibers
		this.warnString +=
			'Use of custom structural fibers, must be documented by adequate testing in accordance with EN1990-1-1 Annex D';

		if (this.f_R1 < 1.5 || this.f_R3 < 1.0) {
			this.warnString += 'Note: current fiber dosage does not adhere to CE requirements';
		}

		this.l_f = userFiberData.length; // fibre length [mm]

		this.contentString = Content + 'kg/m³ ' + this.name + ' ' + this.l_f + 'mm';
	}
}

export type structural_fibers = DURUS_EasyFinish | DURUS_S500 | ADFIL_SF86 | Custom_fiber;

export type predefineFiberInput = {
	type: 'DURUS® EasyFinish' | 'DURUS® S500' | 'DURUS® FlooringFibre' | 'ADFIL SF86';
	Content: string;
	selected_code: string;
	userFiberData: {};
};

export type customFiberInput = {
	type: 'Custom';
	Content: string;
	selected_code: string;
	userFiberData: {
		name: string;
		f_R1: number;
		f_R2: number;
		f_R3: number;
		f_R4: number;
		f_R1k: number;
		f_R2k: number;
		f_R3k: number;
		f_R4k: number;
		length: number;
		EPD_A1A3: number;
		EPD_A1D: number;
		EPD_link: string;
		density: number;
	};
};

export function fiberSelect(fiberInput: predefineFiberInput | customFiberInput): structural_fibers {
	if (fiberInput.type === 'DURUS® EasyFinish') {
		return new DURUS_EasyFinish(fiberInput.Content, fiberInput.selected_code);
	} else if (fiberInput.type === 'DURUS® S500') {
		return new DURUS_S500(fiberInput.Content, fiberInput.selected_code);
	} else if (fiberInput.type === 'ADFIL SF86') {
		return new ADFIL_SF86(fiberInput.Content, fiberInput.selected_code);
	} else if (fiberInput.type === 'DURUS® FlooringFibre') {
		return new DURUS_FF32(fiberInput.Content, fiberInput.selected_code);
	} else if (fiberInput.type === 'Custom') {
		return new Custom_fiber(fiberInput.Content, fiberInput.selected_code, fiberInput.userFiberData);
	} else {
		throw new Error('No valid fiber type selected');
	}
}
