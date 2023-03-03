import {
	opWr_title,
	opWr_eqOnly,
	opWr_eqNoTitle,
	opWr_2eqs_2titles_noLatex,
	opWr_2eqs_2titles,
	opWr_eq,
	opWr_oneLine,
	opWr_2eqs,
	Round,
} from '../classes/helper_functions.js';

export class CrossSectionAnalysis {
	// Run through a constructor function when initializing the class:

	constructor(Geometry, Reinforcement, AnalysisParameters) {
		// initialize analysis state:

		//this.BeamSection = BeamSection;
		this.Geometry = Geometry;
		this.Reinforcement = Reinforcement;
		this.AnalysisParameters = AnalysisParameters;

		this.state = 'Not calculated';

		//  ****** Concrete arrays: ******
		let A_c = [];
		let z_c = [];
		let y_c = [];
		let E_c_eff = []; // effective conc. elastic modulus [MPa]
		let n_c = 0;

		this.Geometry.slices.forEach((slice) => {
			A_c.push(slice.A_c);
			z_c.push(slice.z_c);
			y_c.push(slice.y_c);
			E_c_eff.push(this.Geometry.Uniform_material.E);
			n_c += 1; // total number of cross sectional slices
		});

		this.A_c_total = A_c.reduce((a, b) => a + b);

		//  ****** Reinforcement arrays: ******
		this.A_s = this.Reinforcement.A_s;
		this.z_s = this.Reinforcement.z_s;
		this.y_s = this.Reinforcement.y_s;
		this.E_s_eff = this.Reinforcement.E_s;

		this.A_s_total = this.A_s.reduce((a, b) => a + b);

		// Save state:
		this.A_c = A_c;
		this.z_c = z_c;
		this.y_c = y_c;
		this.E_c_eff = E_c_eff;
		this.n_c = n_c;

		this.SectionForces = {};

		// dummy UR properties:
		this.UR_M = undefined;
		this.UR_v = undefined;

		// empty arrays:
		this.sig_c = [];
		this.eps_c = [];
		this.sig_s = [];
		this.eps_s = [];

		this.result_map = new Map();
	} // ******** END of constructor function ************

	get IsOk() {
		if (Round(this.UR_total, 2) > 1) return false;
		return true;
	}
	// *************************************************************************
	// ******************************** METHODS ********************************
	// *************************************************************************

	Solve_with_M(SectionForces, Console_log = false) {
		// Solve stress state based on given input section forces
		this.Find_stress_state('Moment', SectionForces, 0, Console_log);
		this.state = 'Solved with M';
	}
	//  ----------------------------------------------------------------------------------

	Solve_with_kappa(SectionForces, kappa, Console_log = false) {
		// Solve stress state based on given input curvature; kappa
		this.Find_stress_state('Kappa', SectionForces, kappa, Console_log);
		this.state = 'Solved with Kappa';
	}
	//  ----------------------------------------------------------------------------------

	Get_ultimate_capacity(SectionForces, Update_state = false) {
		let eps = (SectionForces.N * 1000) / (this.A_c_total * this.Geometry.Uniform_material.E);
		let init_kappa =
			Math.max(1e-10, (7.2e-4 + eps) / this.Geometry.height) * -Math.sign(SectionForces.Mz);

		let sub_analysis = new CrossSectionAnalysis(
			this.Geometry,
			this.Reinforcement,
			this.AnalysisParameters
		); // recursion!

		let kappa = init_kappa;
		let prev_kappa = 0;
		let Prev_F = 0;
		let F_prime = 0;
		let F = 1;

		let iterations_count = 0;

		let max_iterations = 200;

		let key = 'N' + SectionForces.N + Math.sign(SectionForces.Mz);

		let Mrd = 0;

		if (this.result_map.has(key)) {
			let stored = this.result_map.get(key);
			Mrd = stored.M;
			kappa = stored.kappa;
			// console.log('capacity from storage: key=' + key);
		} else {
			FindM: do {
				sub_analysis.Solve_with_kappa(SectionForces, kappa, false);
				iterations_count += 1;

				// Newton-Raphson method:
				Prev_F = F;
				F = Math.log10(sub_analysis.UR_total);
				F_prime = (F - Prev_F) / (kappa - prev_kappa);

				prev_kappa = kappa;

				if (iterations_count < 3) {
					// first guesses to get better function inclination f_prime
					kappa = kappa * 1.01;
				} else {
					kappa = prev_kappa - F / F_prime;
				}

				if (Math.sign(kappa) != Math.sign(init_kappa)) kappa = -kappa; // change sign if reversing

				if (iterations_count == max_iterations) {
					console.log('Could not find Mrd! w/ N=' + SectionForces.N);
					break FindM;
				}
			} while (Math.abs(F) > 0.005);
			// console.log('Mrd found in : ' + interation_count + 'steps');

			Mrd = sub_analysis.Mz;

			this.result_map.set(key, { M: Mrd, kappa: kappa });
		}

		// console.log("Update_state:", Update_state);
		if (Update_state) {
			this.Solve_with_kappa(SectionForces, kappa, false);
		}

		this.UR_M = SectionForces.Mz / Mrd;
		if (this.UR_v === undefined || this.UR_v < this.UR_M) this.UR_total = this.UR_M;

		// console.log('cross section calc Ult, iterations:' + iterations_count);

		return {
			Mrd: Mrd,
			kappa: kappa,
		};
	}
	//  ----------------------------------------------------------------------------------

	getShearCapacity(SectionForces, dir = 'Z') {
		// Function to get ulimate shear capacity

		let Output = []; // array of output strings for documentation

		if (this.AnalysisParameters.Code === 'fib') {
			// Output.push('Shear Verification in accordance with fib Model Code 2010');
			Output.push(opWr_title('Shear Verification in accordance with fib Model Code 2010'));
		} else if (this.AnalysisParameters.Code === 'EC') {
			// Output.push('Shear Verification in accordance with prEN1992-1-1');
			Output.push(opWr_title('Shear Verification in accordance with prEN1992-1-1'));
		}

		if (SectionForces !== this.SectionForces) {
			//run analysis with
			console.log('Updating analysis with concurrent section forces');
			this.Solve_with_M(SectionForces, true);
		}

		let A_sw = this.Reinforcement.A_sw;
		let s_stirrup = this.Reinforcement.spacing_shear;

		if (this.Geometry.shape === 'Circular') {
			let cov = 0;
			if (A_sw > 0) cov = this.Reinforcement.stirr_cov_top + this.Reinforcement.dia_shear / 2;
			this.Geometry.CalcBW(this.CG_comp, this.CG_tens, cov);
		}

		let gamma = this.gamma();
		let bw = this.Geometry.bw.z;
		let d = this.TensileZone.d_eff;
		let z = this.leverArm;

		let As = 0; // steel area in tension
		for (let i = 0; i < this.A_s.length; i++) {
			if (this.sig_s[i] > 0) As += this.A_s[i];
		}

		this.shearArea = this.Geometry.ShearArea(this.CG_comp, this.CG_tens);

		let cover_bot = this.Reinforcement.stirr_cov_bot;
		let cover_top = this.Reinforcement.stirr_cov_top;
		let stirr_dia = this.Reinforcement.dia_shear;
		this.stirrups = this.Geometry.Stirrups(stirr_dia, cover_top, cover_bot);

		if (dir === 'Y') {
			bw = this.Geometry.bw.y;
			d = this.dy;
			z = 123; // !!
			console.warn('Not supported yet!');
		}

		let f_Ftuk = this.Geometry.Uniform_fibres.f_Ftsk;
		if (this.AnalysisParameters.Code === 'fib') {
			f_Ftuk = this.Geometry.Uniform_fibres.get_f_Ftuk(1.5); // strenght at 1.5mm crack used in fib
		}

		let f_Ftud = this.Geometry.Uniform_fibres.f_Ftud(gamma.m);

		let f_ctk = this.Geometry.Uniform_material.f_ctk;
		let f_ck = this.Geometry.Uniform_material.f_ck;
		let f_cd = this.Geometry.Uniform_material.f_cd(gamma.c);
		let f_yk = this.Reinforcement.Material.f_yk;

		let tau_cf = 0;

		let tau_s = 0; // shear component i stirrups

		if (SectionForces.N > 0) {
			Output.push(`<div class="row nobreak">
							<div class="col_full">
								\\( N_{Ed} > 0 \\) : Fibres cannot be utilized for shear resistance if utilized for axial tension!
							</div>
						</div>`);

			Output.push(opWr_eqOnly('\\implies f_{Ftuk} = f_{Ftud} = 0'));
			f_Ftuk = 0;
			f_Ftud = 0;
		}

		this.ActiveStirrups = true;
		if (A_sw > 0 && s_stirrup > Round(0.75 * d, 1)) {
			Output.push(opWr_eqOnly(`\\mathbf{Stirrup \\ spacing \\ too \\ large!}`));
			Output.push(
				opWr_eqNoTitle(`s_{w} = ${s_stirrup} \\text{ mm} \\gt 0.75 d`, Round(0.75 * d, 1), 'mm')
			);
			A_sw = 0;
			this.ActiveStirrups = false;
			Output.push(opWr_eqOnly('\\implies A_{sw} = 0'));

			if (this.Geometry.shape === 'Circular') {
				let cov = 0;
				this.Geometry.CalcBW(this.CG_comp, this.CG_tens, cov);
				bw = this.Geometry.bw.z;
				if (dir === 'Y') bw = this.Geometry.bw.y;
			}
		}

		let rho_w = A_sw / (bw * s_stirrup);

		let Aw = bw * z;

		Output.push(
			opWr_eq(
				`Internal lever arm from flexure (M = ${Round(this.Mz, 1)} kNm)`,
				'z',
				Round(z, 2),
				'mm',
				false
			)
		);

		Output.push(
			opWr_2eqs_2titles_noLatex(
				'Shear width',
				'b_{w}',
				Round(bw, 2),
				'mm',
				'Shear area',
				'A_{w} = b_{w}z',
				Round(Aw, 0),
				'mm²'
			)
		);

		let d_fact = 1;
		if (f_ck > 60) d_fact = Math.pow(60 / f_ck, 4);
		let d_dg = Math.min(40, 16 + this.Geometry.Uniform_material.D_lower * d_fact);

		let rho = As / (bw * d);
		let v_min = 0;
		let tau_min = 0;

		let eta_ss = 1; // contribution factor for stirrups - reduced to 0.75 if fibres

		let sig_cp = -SectionForces.N / this.A_c_total / 1000;
		Output.push(
			opWr_eq('Compression in the section', 'sigma_{cp} = N/A_{c}', Round(sig_cp, 2), 'MPa', true)
		);

		let min_req = Round(0.08 * Math.sqrt(f_ck), 2);

		let minShearCheck = Round(f_Ftuk + rho_w * f_yk, 2) < min_req;

		if (minShearCheck) {
			// Output.push('Not sufficient: Fiber and stirrups contribution neglected');
			Output.push(`
				<div class="row nobreak">
					<div class="col_full">
						Minimum shear reinforcement: \\( \\begin{aligned} f_{Ftuk} + \\rho_{w} f_{yk} &\\geq 0.08 \\sqrt{f_{ck}} = ${min_req} \\text{ MPa} \\\\ &= ${Round(
				f_Ftuk + rho_w * f_yk,
				2
			)} \\text{ MPa} \\end{aligned} \\quad \\) <i class="far fa-2x fa-times-circle text-danger"></i> 
					</div>
				</div>
				<div class="row nobreak">
					<div class="col_full">
						Not sufficient: Fiber and stirrups contribution neglected
					</div>
				</div>
			`);

			f_Ftuk = 0;
			f_Ftud = 0;
			rho_w = 0;

			this.ActiveStirrups = false;
		} else {
			// Output.push('OK!');
			// Output.push('<div class="row nobreak"><div class="col_full"><i class="far fa-2x fa-check-circle text-success"></i></div></div>');

			Output.push(`
				<div class="row nobreak">
					<div class="col_full">
						Minimum shear reinforcement: \\( \\begin{aligned} f_{Ftuk} + \\rho_{w} f_{yk} &\\geq 0.08 \\sqrt{f_{ck}} = ${min_req} \\text{ MPa} \\\\ &= ${Round(
				f_Ftuk + rho_w * f_yk,
				2
			)} \\text{ MPa} \\end{aligned} \\quad \\) <i class="far fa-2x fa-check-circle text-success"></i> 
					</div>
				</div>
			`);
		}

		// Output.push('');

		let isMiniReinforced = this.minimumReinf().verified;
		if (isMiniReinforced) {
			// ***** Contribution from concrete - with longitudinal reinforcement ******

			if (this.AnalysisParameters.Code === 'fib') {
				if (f_Ftuk > 0) {
					// fib MC2010 - 7.7.3.2.2:
					Output.push(opWr_title('Shear capacity of fiber-concrete matrix'));

					let k = Math.min(2.0, 1 + Math.pow(200 / d, 0.5));

					Output.push(
						opWr_oneLine(
							'Size effect factor',
							`\\begin{aligned} k = 1 + \\sqrt{\\frac{200}{d}}  & \\leq 2.0   \\\\ & = ${Round(
								k,
								2
							)} \\end{aligned}`
						)
					);

					tau_cf =
						((0.18 / gamma.c) *
							k *
							Math.pow(100 * rho * (1 + (7.5 * f_Ftuk) / f_ctk) * f_ck, 1 / 3) +
							0.15 * sig_cp) *
						(d / z); // d/z factor to account for how VRd,cf used d rather than z, like everything else.

					Output.push(
						opWr_eqNoTitle(
							`\\tau_{Rd,cf} = \\left( \\frac{0.18}{\\gamma_{c}} k \\left( 100 \\rho \\left(1+7.5 \\frac{f_{Ftuk}}{f_{ctk}}\\right) f_{ck} \\right)^{1/3} + 0.15 \\cdot \\sigma_{cp} \\right) \\cdot \\frac{d}{z}`,
							Round(tau_cf, 2),
							'MPa'
						)
					);

					// techincally only shown to be valid with steel fibres of conventional strength.

					// 7.7-5
					// Output.push('Although not less than:');
					v_min = 0.035 * Math.pow(k, 3 / 2) * Math.pow(f_ck, 1 / 2);
					tau_min = v_min + sig_cp * 0.15;

					Output.push(
						opWr_eq(
							'Although not less than',
							`\\tau_{Rd,min} = \\left( 0.035 \\cdot k^{3/2}f_{ck}^{1/2} + 0.15 \\cdot \\sigma_{cp} \\right) \\cdot \\frac{d}{z}`,
							Round(tau_min, 2),
							'MPa',
							false
						)
					);
				} else {
					// Not sufficient fibres:

					Output.push(opWr_title('Shear resistance of concrete'));

					// Level I approx:
					let k_v = 180 / (1000 + 1.25 * z);

					Output.push(
						opWr_eq(
							'Level I approximation',
							'k_{v} = \\frac{180}{1000 + 1.25z}',
							Round(k_v, 2),
							'',
							false
						)
					);

					// Level II approx:
					// let dg = this.Geometry.Uniform_material.D_upper
					// if (f_ck > 70){
					// 	dg = 0 // reduction due to fracture of aggregates.
					// }
					// let k_dg = Math.max(0.75, 32 / (16 + dg))
					// let k_v = 0.4/(1+1500*eps_x) * 1300 / (1000+k_dg * z)

					tau_cf = (k_v * Math.sqrt(f_ck)) / gamma.c;

					Output.push(
						opWr_eqNoTitle(
							'\\tau_{Rd,c} = k_{v} \\frac{\\sqrt{f_{ck}}}{\\gamma_{c}}',
							Round(tau_cf, 2),
							'MPa'
						)
					);
					// no contribution from compression in section??

					// Output.push('Although not less than:'); //  <--------------------------------------- does this apply ??
					// v_min = 0.035 * Math.pow(k, 3 / 2) * Math.pow(f_ck, 1 / 2);
					// tau_min = v_min + sig_cp * 0.15;
					// Output.push(
					// 	'$$ \\tau_{Rd,min} = 0.035 \\cdot k^{3/2}f_{ck}^{1/2} + 0.15 \\cdot \\sigma_{cp} = ' +
					// 		Round(tau_min, 2) +
					// 		' \\text{ MPa} $$'
					// );
				}
			} else if (this.AnalysisParameters.Code === 'EC') {
				let eta = 1;

				if (f_Ftuk > 0) {
					// Output.push('Shear Verification in accordance with prEN1992-1-1 - FRC L.8.2.2 (L.18)');
					Output.push(
						opWr_title('Shear Verification in accordance with prEN1992-1-1 - FRC L.8.2.2 (L.18)')
					);

					// prEN1992-1-1

					eta = Math.max(0.4, 1 / (1 + 0.43 * Math.pow(f_Ftuk, 2.85)));

					Output.push(
						opWr_eqOnly(
							`\\eta = \\text{max} \\left( \\frac{1}{1+0.43 f_{Ftuk}^{2.85} } , 0.4	\\right) = ${Round(
								eta,
								2
							)}`
						)
					);

					eta_ss = 0.75; // combination factor is stirrups are also present

					// L.8.2.2 - (L.18)
					tau_cf =
						((eta * 0.6) / gamma.c) * Math.pow(100 * rho * f_ck * (d_dg / d), 1 / 3) + f_Ftud;

					Output.push(
						opWr_eqOnly(
							`\\tau_{Rd,cf} = \\eta \\frac{0.6}{\\gamma_{c}} \\left( 100 \\rho \\cdot f_{ck} \\frac{d_{dg}}{d} \\right)^{1/3} + f_{Ftud} \\geq  \\eta \\cdot \\tau_{Rd,min} + f_{Ftud}`
						)
					);
				} else {
					// convetional shear verificaiton of concrete
					// Output.push('Shear resistance of concrete:');
					Output.push(opWr_title('Shear resistance of concrete'));

					tau_cf = (0.66 / gamma.v) * Math.pow(100 * rho * f_ck * (d_dg / d), 1 / 3);

					Output.push(
						opWr_eqOnly(
							`\\tau_{Rd,c} = \\frac{0.66}{\\gamma_{v}} \\left( 100 \\rho \\cdot f_{ck} \\frac{d_{dg}}{d} \\right)^{1/3} \\geq  \\tau_{Rd,min}`
						)
					);
				}

				let f_yd = this.Reinforcement.Material.f_yd(gamma.s);
				v_min = (11 / gamma.v) * Math.pow((f_ck / f_yd) * (d_dg / d), 1 / 2);

				Output.push(
					opWr_eq(
						'Where',
						`\\tau_{Rd,min} = \\frac{11}{\\gamma_{V}} \\sqrt{ \\frac{f_{ck}}{f_{yd}} \\frac{d_{dg}}{d}}`,
						Round(v_min, 2),
						'MPa',
						false
					)
				);

				tau_min = eta * v_min + f_Ftud;

				tau_cf = Math.max(tau_min, tau_cf);

				// Output.push(' \\( \\tau_{Rd,cf} = ' + Round(tau_cf, 2) + ' \\text{ MPa} \\) ');
				Output.push(opWr_eqNoTitle(`\\tau_{Rd,cf}`, Round(tau_cf, 2), `MPa`));
			}
		} else {
			// without longitudinal reinforcement
			// Output.push('Shear resistance without longitudinal reinforcement:');
			Output.push(opWr_title('Shear resistance without longitudinal reinforcement'));

			if (this.AnalysisParameters.Code === 'fib') {
				if ((f_Ftud = 0)) {
					// plain concrete shear - anything in fib??
					tau_cf = 0;
					Output.push('No plain concrete shear capacity given: ' + ' \\( \\tau_{Rd,c} = 0 \\)  ');
				} else {
					let tau_f = f_Ftuk / gamma.m;
					tau_cf = tau_f;

					Output.push(
						' \\( \\sigma_{1} \\leq \\frac{f_{Ftuk}}{\\gamma_{f}} = ' +
							Round(tau_f, 2) +
							' \\text{ MPa} \\) '
					);
					Output.push(' \\( \\tau_{Rd,f} = ' + Round(tau_cf, 2) + ' \\text{ MPa} \\) ');

					// should be compared with principle stress 'σ₁'
					// tau_cf = Math.pow(16 * tau_f * tau_f + 16 * tau_f * -sig_cp, 0.5) / 4;
				}
			} else if (this.AnalysisParameters.Code === 'EC') {
				if (f_Ftud > 0) {
					tau_cf = f_Ftud; // L.14.3 - (L.31)

					// Output.push(' \\( \\tau_{Rd,f} =  f_{Ftud}= ' + Round(tau_cf, 2) + ' \\text{ MPa} \\) ');
					Output.push(opWr_eqNoTitle(`\\tau_{Rd,f} =  f_{Ftud}`, Round(tau_cf, 2), 'MPa'));
				} else {
					// unreinforced capacity
					// Output.push('Shear resistance of plain concrete:');
					Output.push(opWr_title('Shear resistance of plain concrete'));

					let alpha = this.Geometry.Uniform_material.alpha_ct;

					// subanalysis without
					let sub_analysis = new CrossSectionAnalysis(this.Geometry, this.Reinforcement, {
						Code: this.AnalysisParameters.Code,
						NationalAnnex: this.AnalysisParameters.NationalAnnex,
						Rely_on_Conc_tens: false,
						Concrete_stress_function: this.AnalysisParameters.Concrete_stress_function,
						Strain_harden: this.AnalysisParameters.Strain_harden, // Allow for strain hardening of reinforcement.
						max_iterations: this.AnalysisParameters.max_iterations, // Maximum allowable iterations to find solution before stopping (Default = 1000)
						crack_limit: this.AnalysisParameters.crack_limit, // Design crack width - for SLS only
					}); // recursion!

					sub_analysis.Solve_with_M(this.SectionForces, false);

					let Acc = 0; // area in compression
					for (let i = 0; i < sub_analysis.sig_c.length; i++) {
						if (sub_analysis.sig_c[i] < 0) {
							Acc += sub_analysis.A_c[i];
						}
					}

					if (this.AnalysisParameters.NationalAnnex !== 'DK NA') alpha = 0.8;

					// plain concrete strength
					let f_ctd_pl = this.Geometry.Uniform_material.f_ctd(gamma.ct, alpha);
					let f_cd_pl = this.Geometry.Uniform_material.f_cd(gamma.c, alpha);

					let sig_lim = f_cd_pl - 2 * Math.sqrt(f_ctd_pl * (f_ctd_pl + f_cd_pl));

					if (sig_cp < sig_lim) {
						tau_cf = Math.sqrt(f_ctd_pl * f_ctd_pl + sig_cp * f_ctd_pl);
					} else {
						tau_cf = Math.sqrt(
							f_ctd_pl * f_ctd_pl + sig_cp * f_ctd_pl - Math.pow((sig_cp - sig_lim) / 2, 2)
						);
					}

					let cor_factor = Acc / (Aw * 1.5);
					tau_cf = tau_cf * cor_factor;
					// debugger;

					// Output.push(' \\( \\tau_{Rd,c} =  ' + Round(tau_cf, 2) + ' \\text{ MPa} \\) ');
					Output.push(opWr_eqNoTitle(`\\tau_{Rd,c}`, Round(tau_cf, 2), 'MPa'));
				}
			}
		}

		Output.push('');

		// Contribution from stirrups

		let cotTheta = this.cotTheta || 1.0; // 45 deg if no stirrups to minimize!

		if (rho_w > 1e-5) {
			// same for EC () and fib (7.3-29)
			// Output.push('Shear capacity of stirrups');
			Output.push(opWr_title('Shear capacity of stirrups'));

			Output.push(
				opWr_eq(
					'Shear reinforcement ratio',
					'\\rho_{w} = \\frac{A_{sw}}{s_{w} \\cdot b_{w} }',
					Round(rho_w * 100, 2),
					'%',
					false
				)
			);

			let Ved = Math.abs(SectionForces.Vz);

			if (cotTheta !== this.cotTheta) {
				// if strut angle not user defined
				if (Ved > 0) {
					cotTheta = Math.max(
						1,
						Math.min(2.5, 2.5 - (0.1 * SectionForces.N) / Math.abs(SectionForces.Vz))
					);
				} else {
					cotTheta = 2.5;
				}

				if (this.Reinforcement.shearMaterial.class === 'A') {
					// Output.push('Ductility class A: strut angle reduced by 20%');
					Output.push(opWr_title('Ductility class A: strut angle reduced by 20%'));
					cotTheta = Math.max(1, cotTheta * 0.8);
				}
			}
			// Output.push('Shear strut angle: \\( \\cot\\theta = ' + cotTheta + ' \\)');
			Output.push(opWr_eq('Shear strut angle', '\\cot\\theta', cotTheta, '', false));

			tau_s = eta_ss * rho_w * this.Reinforcement.shearMaterial.f_yd(gamma.s) * cotTheta;

			if (eta_ss == 1) {
				Output.push(
					opWr_eqNoTitle(`\\tau_{Rd,s}  =  \\rho_{w} f_{yd} \\cot(\\theta)`, Round(tau_s, 2), 'MPa')
				);
			} else {
				Output.push(
					opWr_2eqs(
						'Combination factor',
						'\\eta_{s}',
						eta_ss,
						'',
						`\\tau_{Rd,s}  = \\eta_{s} \\rho_{w} f_{yd} \\cot(\\theta)`,
						Round(tau_s, 2),
						'MPa',
						false
					)
				);
			}
		} else {
			Output.push(
				opWr_2eqs_2titles(
					'No active shear reinforcement',
					'tau_{Rd,s}',
					0,
					'',
					'Shear strut angle',
					'cot\\theta',
					cotTheta,
					''
				)
			);
		}

		// limit my concrete compression of inclined strut: (will only become an issue if there are alot of stirrups)
		let tau_max = 0;
		Output.push(opWr_title('Shear stress limited by compression of diagonal strut'));
		if (this.AnalysisParameters.Code === 'fib') {
			let ke = 0.55;
			let kc = ke * Math.min(1.0, Math.pow(30 / f_ck, 1 / 3));

			Output.push(
				opWr_eq(
					'Efficiency factor',
					`k_{\\varepsilon} = ${ke} \\quad k_{c} = k_{\\varepsilon} (30/f_{ck})^{1/3}`,
					Round(kc, 2),
					'',
					false
				)
			);

			tau_max = (kc * f_cd) / (cotTheta + 1 / cotTheta); //!!

			Output.push(
				opWr_eqNoTitle(
					`\\tau_{Rd,max} = k_{c} f_{cd} \\sin\\theta\\cos\\theta`,
					Round(tau_max, 2),
					'MPa'
				)
			);
		} else if (this.AnalysisParameters.Code === 'EC') {
			let nu = 0.5; // ??

			if (this.AnalysisParameters.NationalAnnex === 'DK NA') {
				nu = Math.max(0.45, 0.7 * (1 - f_ck / 200));

				Output.push(
					opWr_eq(
						'Efficiency factor',
						`\\nu = 0.7 \\left( 1 - \\frac{f_{ck}}{200} \\right) \\geq 0.45  \\quad`,
						Round(nu, 2),
						'',
						false
					)
				);
			} else {
				nu = 0.6 * (1 - f_ck / 250);

				Output.push(
					opWr_eq(
						'Efficiency factor',
						`\\nu = 0.6 \\left( 1 - \\frac{f_{ck}}{250} \\right)`,
						Round(nu, 2),
						'',
						false
					)
				);
			}

			tau_max = (nu * f_cd) / (cotTheta + 1 / cotTheta);

			Output.push(
				opWr_eqNoTitle(
					`\\tau_{Rd,max} = \\nu f_{cd} \\left(\\cot\\theta + \\tan\\theta \\right)^{-1}`,
					Round(tau_max, 2),
					'MPa',
					false
				)
			);
		}

		// "Eq. (7.7-14) is based on steel fibre concrete research, and should be checked for other types of material."

		let tau_Rd = Math.min(tau_max, tau_cf + tau_s);

		Output.push(
			opWr_eq(
				'Total shear stress capacity',
				`\\tau_{Rd} = \\tau_{Rd,cf} + \\tau_{Rd,s} \\leq \\tau_{Rd,max}`,
				Round(tau_Rd, 2),
				'MPa',
				false
			)
		);

		let Vrd = (tau_Rd * Aw) / 1000;

		Output.push(
			opWr_eq(
				'Total shear capacity of section',
				'V_{Rd} = \\tau_{Rd} A_{w}',
				Round(Vrd, 2),
				'kN',
				false
			)
		);

		this.UR_v = Math.abs(SectionForces.Vz) / Vrd;
		if (this.UR_v > this.UR_total) this.UR_total = this.UR_v; // not super happy with this implementation!!

		return {
			Vrd: Vrd,
			output: Output,
		};
	}
	//  ----------------------------------------------------------------------------------

	Get_moment_curvature(SectionForces, Max_curve = 0) {
		// calculate mmoment curvature
		let max_kappa = Max_curve * Math.sign(SectionForces.Mz);
		if (Max_curve === 0) {
			max_kappa = (12e-3 / this.Geometry.height) * Math.sign(SectionForces.Mz);
		}

		let kappa = 0;

		let height_factor = Math.max(1, 1.6 - this.Geometry.height / 1000);

		let f_ct = this.Geometry.Uniform_material.f_ctd(this.gamma().ct);
		let Mcr = this.getCrackingMoment(f_ct, true);
		let kappa_crit = Mcr.kappa_cr;
		// let eps_cr = this.Geometry.Uniform_material.eps_cr(this.gamma().ct) * height_factor;
		// let kappa_i = -((eps_cr * 2) / this.Geometry.height) * Math.sign(SectionForces.Mz); //-max_kappa / 100;
		let kappa_i = kappa_crit;
		if (SectionForces.Verification === 'SLS') kappa_i /= 10;

		let max_iter = Math.abs(Math.round(max_kappa / kappa_i));

		var plot_M = [];
		var plot_UR = [];
		// var plot_F = [];
		// var plot_def = [];
		var plot_kappa = [];
		var plot_CMOD = [];
		var IsSubAnalysIsOk = true;
		var csv_rows = [['F', 'M', 'kappa', 'CMOD']];

		let sub_analysis = new CrossSectionAnalysis(
			this.Geometry,
			this.Reinforcement,
			this.AnalysisParameters
		); // recursion!

		M_curve: for (var i = 0; i <= max_iter; i++) {
			try {
				sub_analysis.Solve_with_kappa(SectionForces, kappa, false);
				IsSubAnalysIsOk = sub_analysis.IsOk;

				if (kappa === 0) {
					plot_UR.push(0);
					plot_M.push(0);
					plot_kappa.push(0);
					plot_CMOD.push(0);
					csv_rows.push([0, 0, 0, 0]);
				} else if (IsSubAnalysIsOk) {
					plot_UR.push(sub_analysis.UR_total);
					plot_M.push(Math.abs(sub_analysis.Mz));
					plot_kappa.push(Math.abs(kappa));
					plot_CMOD.push(sub_analysis.CMOD);
					// plot_def.push(sub_analysis.CMOD*0.85 + 0.04)
					// plot_F.push((-sub_analysis.Mz * 4) / 0.5);
					csv_rows.push([
						(-sub_analysis.Mz * 4) / 0.5,
						-sub_analysis.Mz,
						-kappa,
						sub_analysis.CMOD,
					]);
				}
			} catch {
				// console.log('failed with M=' + M)
				IsSubAnalysIsOk = false;
			}

			if (!IsSubAnalysIsOk) break M_curve;
			kappa += kappa_i;
		}

		// console.log('solves M-k curve in :' + i);
		return {
			UR: plot_UR,
			M: plot_M,
			kappa: plot_kappa,
			CMOD: plot_CMOD,
			iterations: i,
			csv_rows: csv_rows,
		};
	}
	//  ----------------------------------------------------------------------------------

	Get_max_N_capacity(Verif, MaxOrMin = 'Max') {
		if (Verif === 'SLS') {
			var Nmin =
				(-0.99 / 1000) *
				(this.Geometry.slices.reduce(
					(sum, slice) => sum + slice.A_c * this.Geometry.Uniform_material.f_cd * 0.6, // sum of A_c * f_cd
					0
				) +
					this.Reinforcement.A_s.reduce((sum, area) => sum + area) * // sum of A_s * f_yd
						this.Reinforcement.Material.f_yd);

			var Nmax = (0.99 / 1000) * (this.Reinforcement.A_s.reduce((sum, area) => sum + area) * 200);
			// this.BeamSection.Reinforcement.Material.f_yd);
		} else {
			var Nmin =
				(-0.99 / 1000) *
				(this.Geometry.slices.reduce(
					(sum, slice) => sum + slice.A_c * this.Geometry.Uniform_material.f_cd, // sum of A_c * f_cd
					0
				) +
					this.Reinforcement.A_s.reduce((sum, area) => sum + area) * // sum of A_s * f_yd
						this.Reinforcement.Material.f_yd);

			var Nmax =
				(0.99 / 1000) *
				(this.Reinforcement.A_s.reduce((sum, area) => sum + area) *
					this.Reinforcement.Material.f_yd);
		}

		if (MaxOrMin === 'Max') {
			var N = Nmax;
		} else {
			var N = Nmin;
		}

		return N; // kN
	}

	Get_N_M_diagram(div_N = 10, Verif = 'ULS') {
		let Nmin = this.Get_max_N_capacity(Verif, 'Min');
		let Nmax = this.Get_max_N_capacity(Verif, 'Max');

		let plot_N = [];
		let plot_M = [];

		let N = Nmin;
		let N_i = (Nmax - Nmin) / div_N;

		let sub_analysis = new CrossSectionAnalysis(
			this.Geometry,
			this.Reinforcement,
			this.AnalysisParameters
		); // recursion!

		for (let j = 0; j <= 1; j++) {
			for (let i = 0; i <= div_N + j; i++) {
				// positive M first:
				let SectionForces = {
					N: N,
					Mz: +0.01 * (1 - 2 * j),
					// coming soon:
					Vz: 0,
					My: 0,
					Vy: 0,
					T: 0,
					eps_sh: 0,
					Verification: Verif,
				};

				try {
					let Mrd = sub_analysis.Get_ultimate_capacity(SectionForces, false).Mrd;
					plot_N.push(N);
					plot_M.push(Mrd);
				} catch {
					console.log('NM_dia, failed with N=' + N);
				}

				// update N:
				N += N_i * (1 - 2 * j);
			}
		}

		return {
			N: plot_N,
			M: plot_M,
		};
	}

	// ***** MAIN Iteration algorithm: *****
	Find_stress_state(Solver_crit, SectionForces, kappa_ext, Console_log = false) {
		// Function to perform cross section analysis and return the stress distribution:

		this.SectionForces = SectionForces;

		this.cotTheta = SectionForces.cotTheta;

		// Sectionforces
		let N_ext = SectionForces.N;
		let Mz_ext = -SectionForces.Mz; // switch sign
		let My_ext = SectionForces.My;

		if (this.cotTheta !== undefined) {
			N_ext += this.cotTheta * Math.abs(SectionForces.Vz);

			if (this.cotTheta < 0.5 || this.cotTheta > 3) {
				console.warn('Invalid shear stur angle!');
			}
		}

		// Save original external load values and set fictitious internal values
		let N_ext_org = N_ext;
		let Mz_ext_org = Mz_ext;
		let My_ext_org = My_ext;

		let kappa = 0;
		if (Solver_crit == 'Kappa') {
			kappa = kappa_ext;
			Mz_ext = 0;
		}

		this.AnalysisParameters;
		let Verification = SectionForces.Verification; // SLS/ULS/ALS

		// Determine which face is in tension:
		let Tensile_face = 'bottom';
		if (Mz_ext > 0 || kappa > 0) {
			Tensile_face = 'top';
		}
		this.Tensile_face = Tensile_face;

		// ---------------------------------------------------------------- What about Left/Right???

		/////////// INITIALIZE START ///////////

		// ****** Concrete arrays: ******
		let A_c = this.A_c;
		let z_c = this.z_c;
		let y_c = this.y_c;
		let E_c_eff = this.E_c_eff;
		let n_c = this.n_c;

		//  ****** Reinforcement arrays: ******
		let A_s = this.A_s;
		let z_s = this.z_s;
		let y_s = this.y_s;
		let E_s_eff = this.E_s_eff;

		// ****** Rigidity arrays: ********
		let Rigidity = this.Update_R_Vals(E_c_eff, A_c, z_c, y_c, E_s_eff, A_s, z_s, y_s);

		// Rigidity.R_Iz *= 0.3; // initial guess, much softer than uncracked
		// Rigidity.R_Bz *= 0.3;	- not significant improvement in convergence!

		// ****** Strain profile ******
		if (Solver_crit == 'Kappa') {
			var strain = this.get_eps_M(Rigidity, N_ext_org, kappa);
			var eps_ref = strain.eps;
			Mz_ext = strain.M;
		} else {
			var strain = this.Get_strain(Rigidity, N_ext, Mz_ext, My_ext);
			var eps_ref = strain.eps;
			kappa = strain.kappa_z;
		}

		if (Console_log) console.log('initial kappa = ' + kappa);

		// initial values for variables that depend on neutral axis (x) in each step in loops below
		let x = eps_ref / kappa + this.Geometry.ref_z; // Neutral axis
		let TensileZone = this.Get_TensileZone(x, Tensile_face);
		let l_cs = TensileZone.l_cs;

		// Stress/strain arrays:
		let StressArrays = this.Update_stress_arrays(strain, l_cs);
		let check = StressArrays.check;
		let eps_c = StressArrays.eps_c;
		let sig_c = StressArrays.sig_c;
		let eps_s = StressArrays.eps_s;
		let sig_s = StressArrays.sig_s;
		E_c_eff = StressArrays.E_c_eff;
		E_s_eff = StressArrays.E_s_eff;

		// Initial internal forces:
		let InternalForces = this.Get_InternalForces(sig_c, A_c, z_c, y_c, sig_s, A_s, z_s, y_s);
		let N_int = InternalForces.N;
		let Mz_int = InternalForces.Mz;
		let My_int = InternalForces.My;

		// Parameters for algorthm:
		let R_A_old = 0;
		let iteration_count = 0; // counter
		let cr_uncr = 'Uncracked';

		if (this.AnalysisParameters.max_iterations == 'undefined') {
			var max_iterations = 1000;
		} else {
			var max_iterations = this.AnalysisParameters.max_iterations;
		}

		var Analysis_Converged = true;
		/////////// INITIALIZE END ///////////

		/////////// LOOP START ///////////
		if (Console_log) console.time('Loop');
		// if (Math.max.apply(null, check) == 1) {
		cr_uncr = 'Cracked';

		OuterLoop: do {
			do {
				// Copy R value to old
				R_A_old = Rigidity.R_A;
				Rigidity = this.Update_R_Vals(E_c_eff, A_c, z_c, y_c, E_s_eff, A_s, z_s, y_s);

				// Strain profile

				// strain = this.Get_strain(Rigidity, N_ext, Mz_ext, My_ext)
				// eps_ref = strain.eps
				// kappa = strain.kappa_z

				if (Solver_crit == 'Kappa') {
					strain = this.get_eps_M(Rigidity, N_ext_org, kappa);
					eps_ref = strain.eps;
					Mz_ext_org = strain.M;
				} else {
					strain = this.Get_strain(Rigidity, N_ext, Mz_ext, My_ext);
					eps_ref = strain.eps;
					kappa = strain.kappa_z;
				}

				// Update the variables that depend on neutral axis (x)
				x = eps_ref / kappa + this.Geometry.ref_z; // Neutral axis
				TensileZone = this.Get_TensileZone(x, Tensile_face);
				l_cs = TensileZone.l_cs;

				// // update stress/strain arrays
				StressArrays = this.Update_stress_arrays(strain, l_cs);
				check = StressArrays.check;
				eps_c = StressArrays.eps_c;
				sig_c = StressArrays.sig_c;
				eps_s = StressArrays.eps_s;
				sig_s = StressArrays.sig_s;
				E_c_eff = StressArrays.E_c_eff;
				E_s_eff = StressArrays.E_s_eff;

				iteration_count = iteration_count + 1; // iteration counter

				if (iteration_count > max_iterations) {
					// debugger
					console.warn('iteration stopped! - did not converge');
					kappa = undefined;
					Analysis_Converged = false;
					break OuterLoop;
				}
			} while (
				// Check if Resistances has converged
				Math.abs(Rigidity.R_A - R_A_old) > 1
			);

			InternalForces = this.Get_InternalForces(sig_c, A_c, z_c, y_c, sig_s, A_s, z_s, y_s);
			N_int = InternalForces.N;
			Mz_int = InternalForces.Mz;
			My_int = InternalForces.My;

			N_ext = N_int;
			Mz_ext = Mz_int;
			My_ext = My_int;

			// Update everthing with new N_ext and M_ext
			// Update strain profile
			// strain = this.Get_strain(Rigidity, N_ext, Mz_ext, My_ext)
			// eps_ref = strain.eps
			// kappa = strain.kappa_z
			if (Solver_crit == 'Kappa') {
				strain = this.get_eps_M(Rigidity, N_ext_org, kappa);
				eps_ref = strain.eps;
				Mz_ext_org = strain.M;
			} else {
				strain = this.Get_strain(Rigidity, N_ext, Mz_ext, My_ext);
				eps_ref = strain.eps;
				kappa = strain.kappa_z;
			}

			// Update the variables that depend on neutral axis (x)
			x = eps_ref / kappa + this.Geometry.ref_z;
			TensileZone = this.Get_TensileZone(x, Tensile_face);
			l_cs = TensileZone.l_cs;

			// // update stress/strain arrays
			StressArrays = this.Update_stress_arrays(strain, l_cs);
			check = StressArrays.check;
			eps_c = StressArrays.eps_c;
			sig_c = StressArrays.sig_c;
			eps_s = StressArrays.eps_s;
			sig_s = StressArrays.sig_s;
			E_c_eff = StressArrays.E_c_eff;
			E_s_eff = StressArrays.E_s_eff;
		} while (
			// Check equilibrium: do internal forces of given stress distrution match the external forces:
			Math.abs(N_int - N_ext_org) > 0.001 ||
			Math.abs(Mz_int - Mz_ext_org) > 0.001 ||
			Math.abs(My_int - My_ext_org) > 0.001
		);

		if (Math.max.apply(null, check) == 0) cr_uncr = 'Uncracked';
		/////////// LOOP END ///////////

		/////////// COLLECT OUTPUT /////////////

		let h_s = this.Geometry.height - this.Geometry.ref_z - TensileZone.d_eff; // CG of reinf group

		if (Console_log) {
			console.log('Number of iterations: ' + iteration_count);
			console.timeEnd('Loop');
			console.log('cr_uncr: ' + cr_uncr);
			console.log(InternalForces);
			console.log('comp zone, x= ' + x);
			console.log('Tensile zone:');
			console.log(TensileZone);
			console.log('CG of reinf = ' + h_s);
			console.log('final kappa = ' + kappa);
		}

		// strain concrete
		let eps_c_min = Math.min.apply(null, eps_c); // !!
		let eps_c_max = Math.max.apply(null, eps_c); // !!
		this.eps_c_max = eps_c_max;

		// Compression stress concrete
		let sig_c_min = Math.min.apply(null, sig_c); // !!
		this.sig_c_min = sig_c_min;
		this.sig_c_max = Math.max.apply(null, sig_c);

		// Strain at tension rebars, CoG
		let eps_s_CoG = eps_ref + kappa * h_s;
		// Equivalent tensile steel stress
		let sig_s_eq = eps_s_CoG * TensileZone.E_s;

		// cg of compression:
		let C_total = 0;
		let M_comp = 0;
		let sig_c_avg = 0;
		for (let i = 0; i < n_c; i++) {
			if (sig_c[i] < 0) {
				C_total += -sig_c[i] * A_c[i];
				M_comp += -sig_c[i] * A_c[i] * z_c[i];
			}
			sig_c_avg += sig_c[i] * A_c[i];
		}

		sig_c_avg = sig_c_avg / this.A_c_total;
		this.sig_c_avg = sig_c_avg;

		for (let i = 0; i < sig_s.length; i++) {
			if (sig_s[i] < 0) {
				C_total += -sig_s[i] * A_s[i];
				M_comp += -sig_s[i] * A_s[i] * z_s[i];
			}
		}
		this.CG_comp = M_comp / C_total;

		this.C_stringer = C_total / 1000;

		// cg of tension:
		let limit = 50; // arbitrary limit to not get reinforcement in comp side
		let T_total = 0;
		let M_tens = 0;
		for (let i = 0; i < sig_s.length; i++) {
			if (sig_s[i] > limit) {
				// arbitrary limit to not get reinforcement in comp side
				T_total += sig_s[i] * A_s[i];
				M_tens += sig_s[i] * A_s[i] * z_s[i];
			}
		}

		if (T_total === 0) {
			for (let i = 0; i < n_c; i++) {
				if (sig_c[i] > 0) {
					T_total += sig_c[i] * A_c[i];
					M_tens += sig_c[i] * A_c[i] * z_c[i];
				}
			}
		}

		this.CG_tens = M_tens / T_total;

		this.T_stringer = T_total / 1000;

		// steel strain
		if (eps_s.length !== 0) {
			// only if reinforcement is present!
			var eps_s_max = Math.max.apply(null, eps_s); // !!
			var sig_s_max = Math.max.apply(null, sig_s); // !!
			if (Console_log)
				console.log(
					'Max reinf strain: ' + Math.round((eps_s_max * 100 + Number.EPSILON) * 100) / 100 + '%'
				);
		}

		if (Analysis_Converged) {
			// Crack width calc:
			var CrackWidthCalc = this.Calculate_Crackwidth(
				sig_s_eq,
				eps_c_max,
				TensileZone,
				SectionForces.eps_sh
			);

			this.CrackWidthCalc = CrackWidthCalc;
			this.w_k = CrackWidthCalc.w_k;

			if (Console_log) {
				// print crack results:
				console.log('Center of comp zone:' + this.CG_comp);
				console.log('Center of tensile zone:' + this.CG_tens);

				console.log(
					'Max concrete compression: ' +
						Math.round((sig_c_min + Number.EPSILON) * 100) / 100 +
						' MPa'
				);
				console.log(
					'Max compressive strain: ' +
						-Math.round((eps_c_min * 1000 + Number.EPSILON) * 1000) / 1000 +
						'‰'
				);
				console.log(
					'Max tensile strain: ' +
						Math.round((eps_c_max * 1000 + Number.EPSILON) * 1000) / 1000 +
						'‰'
				);
				// console.log('limit: ' + Math.round((Math.min(2.5/l_cs, 0.02)*1000+Number.EPSILON)*100)/100 +'%')

				console.log(
					'eps_dif: ' +
						Math.round((CrackWidthCalc.eps_dif * 1000 + Number.EPSILON) * 1000) / 1000 +
						'‰'
				);
				// console.log('eps_dif: ' + CrackWidthCalc.eps_dif);
				console.log('s_rmax: ' + CrackWidthCalc.s_rmax);
				console.log('w_k: ' + CrackWidthCalc.w_k);
			}

			// Is section verified:
			var Utilization = this.Get_Utilizations(
				eps_c,
				eps_s,
				CrackWidthCalc,
				TensileZone,
				Verification
			);

			this.UR_cc = Utilization.UR_cc;
			this.UR_ct = Utilization.UR_ct;
			this.UR_s = Utilization.UR_s;
			this.UR_crack = Utilization.UR_crack;
			this.UR_total = Utilization.UR_total;

			var UR = Utilization.UR_total;
		} else {
			// did not converge!
			// this.CrackWidthCalc = CrackWidthCalc;
			this.w_k = 999;
			this.UR_cc = 999;
			this.UR_ct = 999;
			this.UR_s = 999;
			this.UR_crack = 999;
			this.UR_total = 999;
		}

		// OUTPUT:
		this.sig_c = sig_c;
		this.z_c = z_c;
		this.y_c = y_c;
		this.eps_c = eps_c;

		this.sig_s = sig_s;
		this.z_s = z_s;
		this.y_s = y_s;
		this.eps_s = eps_s;
		this.A_s = A_s;

		this.CMOD = Math.max.apply(null, StressArrays.COD);
		this.kappa = kappa;
		this.eps_ref = eps_ref;

		this.Neutral_Axis = x;

		if (Tensile_face === 'top') {
			this.leverArm = this.Geometry.height - 0.4 * (this.Geometry.height - x) - TensileZone.d_eff;
		} else {
			this.leverArm = TensileZone.d_eff - (this.Geometry.ref_z - this.CG_comp);
		}

		this.leverArm = Math.abs(this.CG_comp - this.CG_tens);
		if (Console_log) {
			console.log('z = ' + this.leverArm);
		}

		if (Console_log) {
			console.log(Utilization);
			console.log('Is verified?: ' + this.IsOk);
			console.log('UR = ' + UR);
		}

		this.Analysis_Converged = Analysis_Converged;
		this.TensileZone = TensileZone;

		// if (Solver_crit == 'Kappa') Mz_int = -Mz_int;
		this.Mz = -Mz_int;
		this.N = N_ext_org;

		let output = []; // output array of strings

		let DeltaF_String = '';
		if (this.cotTheta !== undefined) {
			DeltaF_String = ' + \\Delta F ';
			output.push(
				'Additional axial force from shear: \\(  \\Delta F = V_{Ed} \\cot\\theta = \\) ' +
					Round(Math.abs(SectionForces.Vz) * this.cotTheta, 2) +
					' kN'
			);
		}

		output.push(
			opWr_2eqs(
				'Resulting stress distribution with',
				'N' + DeltaF_String,
				Round(N_ext, 2),
				'kN',
				'M',
				Round(this.Mz, 2),
				'kNm',
				false
			)
		);

		output.push(opWr_eq('Neutral axis', 'x', Round(this.Neutral_Axis, 2), 'mm', false));

		output.push(opWr_title('Equilibrium strain distribution'));
		output.push(
			opWr_2eqs_2titles(
				'Maximum compressive strain',
				'varepsilon_{cc}',
				Math.round((eps_c_min * 1000 + Number.EPSILON) * 1000) / 1000,
				'‰',
				'Maximum tensile strain',
				'varepsilon_{ct}',
				Math.round((eps_c_max * 1000 + Number.EPSILON) * 1000) / 1000,
				'‰'
			)
		);

		output.push(opWr_title('Extreme material stresses'));
		output.push(
			opWr_2eqs_2titles(
				'Concrete compression',
				'sigma_{c}',
				Math.round((sig_c_min + Number.EPSILON) * 100) / 100,
				'MPa',
				'Reinforcement tension',
				'sigma_{s}',
				Math.round((sig_s_max + Number.EPSILON) * 100) / 100,
				'MPa'
			)
		);

		if (SectionForces.Verification === 'SLS') {
			// Crack width calculations:
			output.push('');
			if (Analysis_Converged) {
				CrackWidthCalc.documentation.forEach((str) => output.push(str));
			} else {
				output.push('No Solution found!');
			}
		}
		this.output = output;
	} // end Find_stress_state
	//  ----------------------------------------------------------------------------------

	// Functions needed for the algorithm:
	Get_Utilizations(eps_c, eps_s, CrackWidthCalc, TensileZone, Verification) {
		// Function to determine whether given strain distrubtion adheres to the design limits:

		// Concrete strain limits:
		let UR_cc_Array = [];
		let UR_ct_Array = [];
		let l_cs = TensileZone.l_cs;

		let gamma = this.gamma();

		// check all concrete slices:
		for (let i = 0; i <= eps_c.length - 1; i++) {
			if (Verification === 'SLS') {
				// SLS: limit = 0.6*f_ck
				UR_cc_Array.push(
					this.Geometry.Uniform_material.stress_strain(
						eps_c[i],
						gamma.c,
						this.AnalysisParameters.Concrete_stress_function
					) /
						(-0.6 * this.Geometry.Uniform_material.f_ck) //
				);
				// console.log('0.8 fck used as stress limit!');
			} else {
				UR_cc_Array.push(eps_c[i] / -this.Geometry.Uniform_material.eps_cu3); // compression strain utilization
			}

			if (this.Geometry.Uniform_fibres.f_Ftsk !== 0) {
				// if fibres:
				var COD_limit = 2.5; // [mm] // limit as per both fib and EC

				if (Verification === 'SLS' && TensileZone.A_s_eff == 0)
					COD_limit = this.AnalysisParameters.crack_limit; // reduced limit if SLS crack width
				var eps_limit = Math.min(0.02, COD_limit / l_cs); // limits match both fib and EC

				if (Verification === 'Real') {
					COD_limit = 4.5; // reduced limit if SLS crack width
					eps_limit = COD_limit / l_cs;
				}

				UR_ct_Array.push(eps_c[i] / eps_limit);
			} else {
				UR_ct_Array.push(0);
			}
		}
		// Find max utlization of all slices:
		var UR_cc = Math.max.apply(null, UR_cc_Array);
		var UR_ct = Math.max.apply(null, UR_ct_Array);

		// crack width:
		var UR_crack = 0;
		if (TensileZone.A_s_eff !== 0 && Verification == 'SLS') {
			UR_crack = CrackWidthCalc.UR_crack;
		}

		// Steel strain limits:
		let UR_s_Array = [];
		for (let i = 0; i <= eps_s.length - 1; i++) {
			let eps_u = this.Reinforcement.Material.eps_ud;
			UR_s_Array.push(eps_s[i] / eps_u);
		}
		var UR_s = Math.max.apply(null, UR_s_Array);

		// Total Utilization:
		var UR_total = Math.max(UR_cc, UR_ct, UR_s, UR_crack);
		// var IsOk = true;
		// if (UR_total > 1) IsOk = false;

		return {
			UR_cc: UR_cc,
			UR_ct: UR_ct,
			UR_s: UR_s,
			UR_crack: UR_crack,
			UR_total: UR_total,
			// ...
			// IsOk: IsOk,
		};
	}
	//  ----------------------------------------------------------------------------------

	Calculate_Crackwidth(sig_s_eq, Max_eps_c, TensileZone, eps_sh = 0) {
		// Calculate crack width in accordance with selected code.
		// ---- INPUT ----
		// sig_s_eq             :   Equivalent stress stress at CG of reinforcement [MPa]
		// Max_eps_c            :   Maximum concrete strain - used if no reinforcement is present
		// TensileZone          :   Object with all information about the tensile zone of the member
		// eps_sh               :   Shrinkage strain if any. [-] (NOT YET IMPLEMENTED!)
		// ---- OUTPUT ----
		// eps_dif              :   Crack producing strain: Mean difference between strain in steel and in concrete [-]
		// s_rmax               :   Maximum spacing between cracks  [mm]
		// w_k                  :   Design crack width [mm]
		// UR_crack             :   Utilization raito: Design crack / crack limit. [-]

		var f_Fts = TensileZone.f_Fts;
		var alpha_e = TensileZone.alpha_e;
		var rho_tc = TensileZone.rho_tc;
		var f_ctm = TensileZone.f_ctm_eff;
		var E_s = TensileZone.E_s;

		let output = [];

		if (this.AnalysisParameters.Code == 'fib') {
			//  ---- fib Model Code 2010 ----
			// output.push('<p>Crack calculation according to fib model code</p>');
			output.push(opWr_title('Crack calculation according to fib model code'));
			TensileZone.documentation.forEach((str) => output.push(str));

			var beta = 0.4; // conservative: long term repeated loading, stabilized cracking stage
			var eta_r = 1.0; //

			// output.push('Long term loading: \\( \\beta = ' + beta + '\\)');
			// output.push('Stabilized cracking stage: \\( \\eta_{r} = ' + eta_r + '\\)');

			output.push(
				opWr_2eqs_2titles(
					'Long term loading',
					'\\beta',
					beta,
					'',
					'Stabilized cracking stage',
					'\\eta_{r}',
					eta_r,
					''
				)
			);

			var f_Ftsm = TensileZone.f_Ftsk / 0.7;
			var sigma_sr = Math.min(sig_s_eq, ((f_ctm - f_Ftsm) * (1 + alpha_e * rho_tc)) / rho_tc); // Added limit of sig_s because it doesnt really make sense otherwise: Matches 0.6 limit form EC
			// output.push(
			// 	'Maximum steel stress during crack formation: ' +
			// 		'\\( \\sigma_{sr} =  (f_{ctm} - f_{Ftsm}) \\frac{1 + \\alpha_{e} \\rho_{p,eff}}{\\rho_{p,eff}} = ' +
			// 		Round(sigma_sr, 2) +
			// 		' \\text{ MPa}  \\leq \\sigma_{s} \\)'
			// );

			output.push(
				opWr_eq(
					'Maximum steel stress during crack formation',
					`\\sigma_{sr} =  (f_{ctm} - f_{Ftsm}) \\frac{1 + \\alpha_{e} \\rho_{p,eff}}{\\rho_{p,eff}}`,
					Round(sigma_sr, 2),
					'MPa \\( \\leq \\sigma_{s} \\)',
					false
				)
			);

			// output.push()

			var eps_dif = (1 / E_s) * (sig_s_eq - beta * sigma_sr + eta_r * eps_sh * E_s);
			var s_rmax = 2 * TensileZone.s_max;

			// output.push('Crack inducing strain difference:');
			// output.push('<div class="row nobreak"><div class="col_full">'+
			//     '\\( \\varepsilon_{sm}-\\varepsilon_{cm} ' +
			//         ' = \\cfrac{\\sigma_{s} - \\beta \\sigma_{sr} }{E_{s}} + \\eta_{r} \\varepsilon_{cs} = ' +
			//         Round(eps_dif * 1000, 3) +
			//         ' ‰  \\)'  + '</div></div>'
			// )

			output.push(
				opWr_eq(
					'Crack inducing strain difference',
					`\\varepsilon_{sm}-\\varepsilon_{cm} = \\cfrac{\\sigma_{s} - \\beta \\sigma_{sr} }{E_{s}} + \\eta_{r} \\varepsilon_{cs}`,
					Round(eps_dif * 1000, 3),
					'‰',
					false
				)
			);
		} else if (this.AnalysisParameters.Code == 'EC') {
			// output.push('<p>Crack calculation according to EN1992</p>');
			output.push(opWr_title('Crack calculation according to EN1992'));

			TensileZone.documentation.forEach((str) => output.push(str));

			// ---- prEN1192-1-1, Annex L ----
			var k_t = 0.4; // Long term value (conservative)
			var eps_dif = Math.max(
				sig_s_eq / E_s - ((k_t * f_ctm) / (E_s * rho_tc)) * (1 + rho_tc * alpha_e) + eps_sh,
				(0.6 * sig_s_eq) / E_s + eps_sh
			);
			var s_rmax = TensileZone.s_max;

			// output.push('Crack spacing: \\( s_{r,max} = ' + Round(s_rmax, 2) + ' \\text{ mm} \\)');
			output.push(opWr_eq('Crack spacing', 's_{r,max}', Round(s_rmax, 2), 'mm', false));

			output.push(`<div class="row nobreak">
							<div class="col_full">
								Crack inducing strain difference:
							</div>
						</div>`);
			// output.push('Crack inducing strain difference:<div>');
			output.push(
				'<div class="row nobreak"><div class="col_full">' +
					'$$ \\begin{aligned} \\varepsilon_{sm}-\\varepsilon_{cm} ' +
					' = \\cfrac{\\sigma_{s} - k_{t} \\cfrac{f_{ct,eff}}{\\rho_{p,eff}} \\left( 1 + \\alpha_{e} \\rho_{p,eff} \\right) }{E_{s}} + \\varepsilon_{cs}' +
					'& \\geq 0.6 \\left( \\cfrac{\\sigma_{s}}{E_{s}}  + \\varepsilon_{cs} \\right) \\\\' +
					'& = ' +
					Round(eps_dif * 1000, 3) +
					' ‰ \\end{aligned} $$' +
					'</div></div>'

				// `<div class="row nobreak">
				// 	<div class="col_full">
				// 		\\( \\varepsilon_{sm}-\\varepsilon_{cm} = \\cfrac{\\sigma_{s} - k_{t} \\cfrac{f_{ct,eff}}{\\rho_{p,eff}} \\left( 1 + \\alpha_{e} \\rho_{p,eff} \\right) }{E_{s}} + \\varepsilon_{cs}
				// 		\\geq 0.6 \\cfrac{\\sigma_{s}}{E_{s}}  + \\varepsilon_{cs} = ${Round(eps_dif * 1000, 3)}‰ \\)
				// 	</div>
				// </div>`
			);
		}

		if (rho_tc < 1e-10) eps_dif = Max_eps_c + eps_sh; // if no steel present - use eps_c

		// design crack width:
		var w_k = s_rmax * eps_dif;
		var w_cr = this.AnalysisParameters.crack_limit;
		var UR_crack = w_k / w_cr; // utilazation

		// output.push('Design crack width: \\( w_{k} = ' + Round(w_k, 2) + ' \\text{ mm} \\)');
		output.push(opWr_eq('Design crack width', 'w_{k}', Round(w_k, 2), 'mm', false));

		return {
			eps_dif: eps_dif,
			s_rmax: s_rmax,
			w_k: w_k,
			UR_crack: UR_crack,
			documentation: output,
		};
	}
	//  ----------------------------------------------------------------------------------

	Get_InternalForces(sig_c, A_c, z_c, y_c, sig_s, A_s, z_s, y_s) {
		// Calculate internal forces for given stress distribution:
		// INPUT:
		//      sig_c   :   Array with concrete stress in each slice [MPa]
		//      A_c     :   Array with area of each slice   [mm^2]
		//      z_c     :   Array with z-coordinates or each slice [mm]
		//      y_c     :   Array with y-coordinates or each slice  [mm]
		//      sig_s   :   Array with steel stress in each reinforcement layer [MPa]
		//      A_cs    :   Array with area of each reinforcement layer [mm^2]
		//      z_c     :   Array with z-coordinates or each reinforcement layer [mm]
		//      y_c     :   Array with y-coordinates or each reinforcement layer [mm]
		// OUTPUT:
		//      N       :   Normal Force [kN]
		//      Mz      :   Bending moment in z-dir [kNm]
		//      My      :   Bending moment in y-dir [kNm]

		// declare variables:
		let N = 0;
		let Mz = 0;
		let My = 0;

		// Concrete forces:
		for (let i = 0; i <= A_c.length - 1; i++) {
			N += A_c[i] * sig_c[i];
			Mz += A_c[i] * sig_c[i] * z_c[i];
			My += A_c[i] * sig_c[i] * y_c[i];
		}

		// Reinforcement forceS:
		for (let i = 0; i <= A_s.length - 1; i++) {
			N += A_s[i] * sig_s[i];
			Mz += A_s[i] * sig_s[i] * z_s[i];
			My += A_s[i] * sig_s[i] * y_s[i];
		}

		// OUT:
		return {
			N: N * 1e-3,
			Mz: Mz * 1e-6,
			My: My * 1e-6,
		};
	}
	//  ----------------------------------------------------------------------------------

	Update_stress_arrays(strain, l_cs) {
		// Calculated stress-, strain- and effective stiffness arrays from input strains
		// INPUT:
		//  Strain      :   Strain object containing:
		//      eps     :       Axial strain in cross section
		//      kappa_z :       Curvature strain in z-dir
		//      kappa_y :       Curvature strain in y-dir
		//  l_cs        :   characteristic length over which the crack strain is distributed

		// Get reinforcement arrays:
		// let ReinfArray = this.Get_ReinfArray(Geometry, Reinforcement);

		// Strain componenets:
		let eps_ref = strain.eps;
		let kappa_z = strain.kappa_z;
		let kappa_y = strain.kappa_y;

		// ------------------ Concrete ------------------
		let eps_c = []; // concrete strain
		let sig_c = []; // conc. stress
		let check = []; // Check if tensile concrete strains are larger than the critical strain, 1 = Yes, 0 = No
		let E_c_eff = []; // Effective stiffness
		let COD = []; // Crack opening
		let f_w = 0;
		let n_c = this.Geometry.slices.length;
		let w_u = 0;
		let E_cm = 0;
		let height_factor = Math.max(1, 1.6 - this.Geometry.height / 1000);

		let gamma = this.gamma();

		let type = this.AnalysisParameters.Concrete_stress_function;
		let f_Ftsk = this.Geometry.Uniform_fibres.f_Ftsk;

		let eps_cr = this.Geometry.Uniform_material.eps_cr(gamma.c, gamma.ct, type) * height_factor;

		if (this.AnalysisParameters.Rely_on_Conc_tens == false) {
			eps_cr = 0;
		}

		// loop through each slice:
		for (let i = 0; i <= n_c - 1; i++) {
			w_u = this.Geometry.Uniform_fibres.w_u;
			E_cm = this.Geometry.Uniform_material.Ec_eff;

			// let f_Ftu = this.Geometry.slices[i].fibres.f_Ftu;

			let eps_i =
				eps_ref + kappa_z * this.Geometry.slices[i].z_c + kappa_y * this.Geometry.slices[i].y_c;

			eps_c.push(eps_i); // strain in slice

			if (eps_i > eps_cr) {
				// if cracked:

				check.push(1);

				let CMOD = (eps_i - eps_cr) * l_cs;
				COD.push(CMOD); //   --   should eps_cr be subtracted??

				if (f_Ftsk == 0) {
					// if not fibres:
					sig_c.push(0);
				} else {
					// with fibres:
					f_w = this.Geometry.Uniform_fibres.getStress(CMOD, gamma.m);
					// f_w = this.Geometry.slices[i].fibres.getStress(CMOD, gamma.m); // f_Fts + (COD[i] / w_u) * (f_Ftu - f_Fts);
					// let sig_i = this.Geometry.slices[i].mat.stress_strain(eps_i, gamma.c, type); // GAMMA.CT ??
					let sig_i = this.Geometry.Uniform_material.stress_strain(eps_i, gamma.c, type); // GAMMA.CT ??

					sig_c.push(Math.min(f_w, sig_i));
				}
				E_c_eff.push(sig_c[i] / eps_i);
			} else {
				check.push(0);
				COD.push(0);
				let sig_i = this.Geometry.Uniform_material.stress_strain(eps_i, gamma.c, type);
				sig_c.push(sig_i);

				if (eps_i == 0) {
					E_c_eff.push(E_cm);
				} else {
					E_c_eff.push(sig_c[i] / eps_c[i]);
				}
			}
		}

		// ------------------ Reinforcement ------------------
		let eps_s = []; // reinf strain
		let sig_s = []; // reinf stress
		let E_s_eff = []; // effecitve stiffness

		// let strain_harden = this.AnalysisParameters.Strain_harden;

		let n_s = this.Reinforcement.A_s.length;
		for (let i = 0; i <= n_s - 1; i++) {
			eps_s.push(
				eps_ref + kappa_z * this.Reinforcement.z_s[i] + kappa_y * this.Reinforcement.y_s[i]
			);
			sig_s.push(this.Reinforcement.Material.stress_strain(eps_s[i], gamma.s));

			if (eps_s == 0) {
				E_s_eff.push(this.Reinforcement.Material.E_s);
			} else {
				E_s_eff.push(sig_s[i] / eps_s[i]);
			}
		}

		return {
			// OUTPUT:
			check: check, // Array with info (0/1) whether the slice is cracked
			eps_c: eps_c, // Array with strain in given concrete slice i
			sig_c: sig_c, // Array with stress in given concrete slice i
			E_c_eff: E_c_eff, // Effective stiffness of given concrete slice i
			eps_s: eps_s, // Array with strain in given reinforcement layer
			sig_s: sig_s, // Array with stress in given reinforcement layer
			E_s_eff: E_s_eff, // Effective stiffness of reinforcement in given layer
			COD: COD, // Array with calculated crack opening at each fibre
		};
	}
	//  ----------------------------------------------------------------------------------

	Update_R_Vals(E_c_eff, A_c, z_c, y_c, E_s_eff, A_s, z_s, y_s) {
		// function to update rigidity values for cross section analysis
		// Input:   E_c_eff : Array with effective stiffness of each concrete slice of the cross section
		//          A_c     : Array of areas of each slice
		//          z_c     : Array of z-coordinates of each slice
		//          y_c     : Array of y-coordinates of each slice
		//          E_s_eff : Array with effective stiffness of each reinforcement layer
		//          A_s     : Array of areas of each reinforcement layer
		//          z_s     : Array of z-coordinates of each reinforcement layer
		//          y_s     : Array of y-coordinates of each reinforcement layer
		//
		// Output: object of the following:
		//          .R_A    : Axial rigidity
		//          .R_Bz   : Rigidity for 1st moment of area : z-dir
		//          .R_By   : Rigidity for 1st moment of area : y-dir
		//          .R_Iz   : Rigidity for 2nd moment of area : z-dir
		//          .R_Iy   : Rigidity for 2nd moment of area : y-dir
		//          .R_Izy   : Rigidity for 2nd moment of area : z/y coupling

		let R_A = 0;
		let R_Bz = 0;
		let R_Iz = 0;
		let R_By = 0;
		let R_Iy = 0;
		let R_Izy = 0;

		// Concrete contribution:
		for (let i = 0; i <= E_c_eff.length - 1; i++) {
			R_A += A_c[i] * E_c_eff[i];
			R_Bz += A_c[i] * E_c_eff[i] * z_c[i];
			R_Iz += A_c[i] * E_c_eff[i] * Math.pow(z_c[i], 2);
			R_By += A_c[i] * E_c_eff[i] * y_c[i];
			R_Iy += A_c[i] * E_c_eff[i] * Math.pow(y_c[i], 2);
			R_Izy += A_c[i] * E_c_eff[i] * y_c[i] * z_c[i];
		}

		// Reinforcement:
		for (let i = 0; i <= E_s_eff.length - 1; i++) {
			R_A += A_s[i] * E_s_eff[i];
			R_Bz += A_s[i] * E_s_eff[i] * z_s[i];
			R_Iz += A_s[i] * E_s_eff[i] * Math.pow(z_s[i], 2);
			R_By += A_s[i] * E_s_eff[i] * y_s[i];
			R_Iy += A_s[i] * E_s_eff[i] * Math.pow(y_s[i], 2);
			R_Izy += A_s[i] * E_s_eff[i] * z_s[i] * y_s[i];
		}

		return {
			// OUTPUT:
			R_A: R_A,
			R_Bz: R_Bz,
			R_Iz: R_Iz,
			R_By: R_By,
			R_Iy: R_Iy,
			R_Izy: R_Izy,
		};
	}
	//  ----------------------------------------------------------------------------------

	Get_strain(Rigidity, N, Mz, My) {
		// Function to get strain componenets (eps, kappa) from input Section forces (N,M) and the cross section rigidities:
		//  INPUT:
		//      Rigitdity   :   Ridigity object containing the following cross section effective rigidities:
		//      N           :   Normal force in section
		//      Mz          :   Bending moment in z-dir
		//      My          :   Bending moment in y-dir
		//  OUTPUT:
		//      eps         :   Axial strain
		//      kappa_z     :   Curvature strain in z-dir
		//      kappa_y     :   Curvature strain in y-dir

		let R_A = Rigidity.R_A;
		let R_Bz = Rigidity.R_Bz;
		let R_Iz = Rigidity.R_Iz;
		let R_By = Rigidity.R_By;
		let R_Iy = Rigidity.R_Iy;
		let R_Izy = Rigidity.R_Izy;

		// Update strain profile
		// let eps =
		// 	(R_Iz / (R_A * R_Iz - Math.pow(R_Bz, 2))) * N * 1000 +
		// 	(-R_Bz / (R_A * R_Iz - Math.pow(R_Bz, 2))) * Mz * 1000000;
		// let kappa_z =
		// 	(-R_Bz / (R_A * R_Iz - Math.pow(R_Bz, 2))) * N * 1000 +
		// 	(R_A / (R_A * R_Iz - Math.pow(R_Bz, 2))) * Mz * 1000000;
		// let kappa_y = 0 * R_By * R_Iy * My; // !!!!!!!!!!!1

		let factor =
			1 /
			(R_Iz * Math.pow(R_By, 2) -
				2 * R_By * R_Bz * R_Izy +
				R_Iy * Math.pow(R_Bz, 2) +
				R_A * Math.pow(R_Izy, 2) +
				-R_A * R_Iy * R_Iz);

		let eps =
			factor *
			((R_Izy * R_Izy - R_Iy * R_Iz) * N * 1000 +
				(R_By * R_Iz - R_Bz * R_Izy) * My * 1000000 +
				(R_Bz * R_Iy - R_By * R_Izy) * Mz * 1000000);

		let kappa_y =
			factor *
			((R_By * R_Iz - R_Bz * R_Izy) * N * 1000 +
				(R_Bz * R_Bz - R_A * R_Iz) * My * 1000000 +
				-(R_By * R_Bz - R_A * R_Izy) * Mz * 1000000);

		let kappa_z =
			factor *
			((R_Bz * R_Iy - R_By * R_Izy) * N * 1000 +
				-(R_By * R_Bz - R_A * R_Izy) * My * 1000000 +
				(R_By * R_By - R_A * R_Iy) * Mz * 1000000);

		return {
			eps: eps, // [-]
			M: Mz,
			kappa_z: kappa_z, // [mm^-1]
			kappa_y: kappa_y, // [mm^-1]
		};
	}
	//  ----------------------------------------------------------------------------------

	get_eps_M(Rigidity, N, kappa) {
		// Function to get epsilon and moment from an applied N and kappa:

		// need to update for biaxial!!

		let R_A = Rigidity.R_A;
		let R_Bz = Rigidity.R_Bz;
		let R_Iz = Rigidity.R_Iz;
		let R_By = Rigidity.R_By;
		let R_Iy = Rigidity.R_Iy;

		// Update strain profile
		let eps = (N * 1000 - R_Bz * kappa) / R_A;
		let M = R_Iz * kappa - (Math.pow(R_Bz, 2) * kappa - N * 1000 * R_Bz) / R_A;

		return {
			eps: eps, // [-]
			M: M * 1e-6, // [kNm]
			kappa_z: kappa, // [mm^-1] - Bi-axial comming later!
			kappa_y: 0,
		};
	}
	//---------------------------------------------------------------------------------

	Get_TensileZone(x, Tensile_face) {
		// Function to return the total area of the reinforcement within the tensile zone, calculated by neutral axis x.
		// Input:
		//      x                   :   height of the neutral axis
		//      Tensile_face        :   String to inform which side of the beam is in tension
		//
		// Output: Object with follow properties::
		//      h_ct                :   Height of tensile zone
		//      A_s_eff             :   Area of steel within tensile zone
		//      A_ct_eff            :   Area of concrete within tensile zone
		//      d_eff               :   CoG of steel within tensile zone
		//      E_cm_eff            :   Mean concrete stiffness within tensile zone
		//      f_ctm_eff           :   Mean tensile strength within zone
		//      Eq_dia              :   Equevalent diameter of bars within zone
		//      l_f                 :   average length of fibres within concrete of the tensile zone
		//      f_Fts               :   average residual strength of fibres within concrete of the tensile zone at 1st cracking
		//      f_Ftu               :   average residual strength of fibres within concrete of the tensile zone at crack limit
		//      s_max               :   maximum spacing between primary cracks
		//      l_cs                :   characteristic length over which the crack strain is distributed.

		let output = [];

		// let ReinfArray = this.Get_ReinfArray(Geometry, Reinforcement);
		let d_s = this.Reinforcement.d_s; // height of each reinf layer
		let A_s = this.Reinforcement.A_s;
		let n_bar = this.Reinforcement.n_bar;

		// bottom face or nothing:
		let outer_dia = this.Reinforcement.outer_dia_bot || 0;
		let outer_spacing = this.Reinforcement.outer_spacing_bot || 0;
		let cover_layer = this.Reinforcement.cover_layer_bot || 0;
		let d = this.Reinforcement.d_bot || 0.75 * this.Geometry.height; // if not reinforcement is present: TR34

		if (Tensile_face == 'top') {
			// top face
			cover_layer = this.Reinforcement.cover_layer_top || 0;
			outer_dia = this.Reinforcement.outer_dia_top || 0;
			outer_spacing = this.Reinforcement.outer_spacing_top || 0;
			d = this.Reinforcement.d_top || 0.75 * this.Geometry.height;
			d = this.Geometry.height - d;
			x = this.Geometry.height - x;
		}

		// height of tensile zone
		let h_ct = Math.max(
			cover_layer + outer_dia * 0.51,
			Math.min(
				this.Geometry.height / 2,
				(1 / 3) * (this.Geometry.height - x),
				2.5 * (this.Geometry.height - d)
			)
		);

		// output.push('Height of tensile zone: \\( h_{ct} = ' + Round(h_ct, 2) + ' \\text{ mm} \\) ');

		// Concrete within tensile zone:
		let A_c_eff = 0;

		let f_ctm = this.Geometry.Uniform_material.f_ctm;
		let Ecm = this.Geometry.Uniform_material.E;
		let l_f = this.Geometry.Uniform_fibres.l_f;
		let f_Ftsk = this.Geometry.Uniform_fibres.f_Ftsk; //0
		let f_Ftuk = this.Geometry.Uniform_fibres.f_Ftuk;

		this.Geometry.slices.forEach((slice) => {
			if (
				(this.Geometry.ref_z + slice.z_c <= h_ct && Tensile_face == 'bottom') ||
				(this.Geometry.ref_z + slice.z_c >= this.Geometry.height - h_ct && Tensile_face == 'top')
			) {
				A_c_eff += slice.A_c;
				// for variation in materia: get average
				// Ecm += slice.mat.E * slice.A_c;
				// f_ctm += slice.mat.f_ctm * slice.A_c;
				// l_f += slice.fibres.l_f * slice.A_c;
				// f_Ftsk += slice.fibres.f_Ftsk * slice.A_c;
				// f_Ftuk += slice.fibres.f_Ftuk * slice.A_c;
			}
		});

		output.push(
			opWr_2eqs_2titles_noLatex(
				'Height of tensile zone',
				'h_{ct}',
				Round(h_ct, 2),
				'mm',
				'Area of concrete in tensile zone',
				'A_{ct,eff}',
				Round(A_c_eff, 0),
				'mm²'
			)
		);
		// output.push(opWr_eq('Area of concrete in tensile zone', 'A_{ct,eff}', Round(A_c_eff, 0), 'mm²', false))

		// output.push(
		// 	'Area of concrete in tensile zone: \\( A_{ct,eff} = ' +
		// 		Round(A_c_eff, 0) +
		// 		' \\text{ mm}^{2} \\) '
		// );

		// mean values within tensile zone:
		// Ecm = Ecm / A_c_eff;
		// f_ctm = f_ctm / A_c_eff;
		// l_f = l_f / A_c_eff;
		// f_Ftsk = f_Ftsk / A_c_eff;
		// f_Ftuk = f_Ftuk / A_c_eff;

		// Reinforcement within tensile zone:
		let A_s_eff = 0;
		let d_eff = 0;
		let SqSum = 0;
		let Sum = 0;

		for (let i = 0; i <= A_s.length - 1; i++) {
			if (
				(Tensile_face == 'top' && d_s[i] <= h_ct) ||
				(Tensile_face == 'bottom' && this.Geometry.height - d_s[i] <= h_ct)
			) {
				A_s_eff += A_s[i];
				d_eff += A_s[i] * d_s[i];
				SqSum += this.Reinforcement.dia[i] * this.Reinforcement.dia[i] * n_bar[i];
				Sum += this.Reinforcement.dia[i] * n_bar[i];
			}
		}

		d_eff = d_eff / A_s_eff; // effective lever arm d, of reinforcement within tensile zone
		let rho_tc = A_s_eff / A_c_eff; // reinforcement ratio
		let eq_dia = SqSum / Sum; // EN1992-1-1 (7.12)
		if (A_s_eff == 0) {
			eq_dia = 0.1; // if not reinforcement is present: TR34
			d_eff = d;
		}
		if (A_s_eff > 0) {
			output.push(
				opWr_eq(
					'Area of reinforcement in tensile zone',
					'A_{s,eff}',
					Round(A_s_eff, 0),
					'mm²',
					false
				)
			);
			// output.push(
			// 	'Area of reinforcement in tensile zone: \\( A_{s,eff} = ' +
			// 		Round(A_s_eff, 0) +
			// 		' \\text{ mm}^{2} \\) '
			// );

			output.push(opWr_eq('Reinforcement ratio', 'rho_{p,eff}', Round(rho_tc * 100, 2), '%', true));
			// output.push(
			// 	'Reinforcement ratio: \\( \\rho_{p,eff} = ' + Round(rho_tc * 100, 2) + ' \\% \\) '
			// );

			output.push(opWr_eq('Equivalent diameter of bars', 'phi_{eq}', Round(eq_dia, 1), 'mm', true));

			// output.push(
			// 	'Equevalent diameter of bars: \\( \\phi_{eq} = ' + Round(eq_dia, 1) + ' \\text{ mm} \\) '
			// );
		}

		if (this.Reinforcement.Material == undefined) {
			var E_s = 200e3; // default
		} else {
			var E_s = this.Reinforcement.Material.E_s; // could steel differ for each bar??
		}

		let alpha_e = E_s / Ecm; // stiffness ratio

		if (this.AnalysisParameters.Code == 'fib') {
			// ---- fib Model Code 2010: ----
			var tau = 1.8 * f_ctm;
			output.push(
				opWr_eq('Mean bond strength', 'tau_{bm} = 1.8 f_{ctm}  =', Round(tau, 2), 'MPa', true)
			);

			// output.push(
			// 	'Mean bond strength: \\( \\tau_{bm} = 1.8 f_{ctm}  = ' + Round(tau, 2) + '\\text{ MPa} \\) '
			// );

			var f_Ftsm = f_Ftsk / 0.7; //         !!!!!!!!!!
			var k = 1.0;
			output.push(opWr_oneLine('k', '= 1.0'));
			// output.push('\\( k = 1.0 \\) ');
			var s_max = Math.max(
				l_f,
				k * cover_layer +
					((((1 / 4) * (f_ctm - f_Ftsm)) / tau) * eq_dia) / (rho_tc + Number.EPSILON)
			);
			var l_cs = Math.min(s_max, this.Geometry.height);

			output.push(
				opWr_oneLine('Characteristic length', 'l_{cs} = \\text{min}\\left( s_{r}, h\\right)')
			);
			// output.push('Characteristic length: \\( l_{cs} = \\text{min}\\left( s_{r}, h\\right)  \\) ');

			output.push(
				opWr_oneLine(
					'Maximum Crack Spacing',
					's_{r} = k \\cdot c + \\frac{1}{4} \\frac{\\phi_{eq}}{\\rho_{p,eff}} \\frac{f_{ctm} - f_{Ftsm}}{\\tau_{bm}}'
				)
			);
			// output.push(
			// 	' \\( s_{r} = k \\cdot c + \\frac{1}{4} \\frac{\\phi_{eq}}{\\rho_{p,eff}} \\frac{f_{ctm} - f_{Ftsm}}{\\tau_{bm}} \\) '
			// );
		} else if (this.AnalysisParameters.Code == 'Watts') {
			// ---- Watts et al. ----
			var s_max = Math.max(
				l_f,
				((f_ctm - f_Ftsk) * eq_dia) / (4 * f_ctm * (rho_tc + Number.EPSILON))
			);
			var l_cs = Math.min(s_max, this.Geometry.height - x);
		} else if (this.AnalysisParameters.Code == 'EC') {
			if (f_Ftsk == 0) {
				// If no fibres: Normal EC:
				var k_1 = 0.8; // Corrugated bars
				var k_2 = 0.5; // Pure bending ///!!! update!
				var k_3 = 3.4;
				if (this.AnalysisParameters.NationalAnnex == 'DK NA') {
					k_3 = Math.min(3.4, 3.4 * Math.pow(25 / cover_layer, 2 / 3));
				}
				var k_4 = 0.425;

				output.push(`<div class="row nobreak">
								<div class="col_full">
									Crack coefficients: \\( k_{1} = \\) ${k_1}, \\( k_{2} = \\) ${k_2}, \\( k_{3} = \\) ${k_3}, \\( k_{4} = \\) ${k_4}
								</div>
							</div>`);

				// output.push(
				// 	'Crack coefficients:  \\( k_{1} = ' +
				// 		k_1 +
				// 		', \\ k_{2} = ' +
				// 		k_2 +
				// 		', \\ k_{3} = ' +
				// 		k_3 +
				// 		', \\ k_{4} = ' +
				// 		k_4 +
				// 		' \\)'
				// );

				if (outer_spacing > 5 * (cover_layer + outer_dia / 2)) {
					var s_max = 1.3 * (this.Geometry.height - x); //  EN1991-1-1 (7.14)

					output.push(
						opWr_oneLine('Spacing larger than limit', '5 \\left( c + \\phi / 2 \\right)')
					);
					// output.push('Spacing larger than limit:  \\( 5 \\left( c + \\phi / 2 \\right)    \\) ')

					output.push(
						opWr_oneLine('Maximum Crack Spacing', 's_{r,max} = 1.3 \\left( h - x \\right)')
					);
					// output.push('\\( s_{r,max} = 1.3 \\left( h - x \\right)   \\) ')
				} else {
					var s_max = k_3 * cover_layer + (k_1 * k_2 * k_4 * eq_dia) / rho_tc; //  EN1991-1-1 (7.11)

					output.push(
						opWr_oneLine(
							'Maximum Crack Spacing',
							's_{r,max} = k_{3} \\cdot c + \\left( k_{1} k_{2} k_{4} \\frac{\\phi_{eq}}{\\rho_{p,eff}} \\right)'
						)
					);
					// output.push(
					// 	' \\( s_{r,max} = k_{3} \\cdot c + \\left( k_{1} k_{2} k_{4} \\frac{\\phi_{eq}}{\\rho_{p,eff}} \\right) \\) '
					// );
				}

				var l_cs = s_max;
			} else {
				// ---- prEN1192-1-1, Annex L ----

				if (rho_tc < 1e-10) {
					s_max = this.Geometry.height; // L.14.4
					var l_cs = s_max;

					output.push(opWr_oneLine('No rebar in tensile zone', 's_{r,max} = h'));
					// output.push('No rebar in tensile zone: \\( s_{r,max} = h \\)');
				} else {
					var s_max =
						(2 * cover_layer + (0.28 * eq_dia) / (rho_tc + Number.EPSILON)) * (1 - f_Ftsk / f_ctm);

					output.push(
						opWr_oneLine(
							'Maximum Crack Spacing',
							's_{r,max} = 2 c + \\frac{0.28 \\phi_{eq}}{\\rho_{p,eff}} \\left( 1 + \\frac{f_{Ftsk}}{f_{ctm}} \\right)'
						)
					);

					// output.push(
					// 	'\\( s_{r,max} = 2 c + \\frac{0.28 \\phi_{eq}}{\\rho_{p,eff}} \\left( 1 + \\frac{f_{Ftsk}}{f_{ctm}} \\right) \\)'
					// );

					var l_cs = Math.min(0.75 * s_max, this.Geometry.height);

					output.push(
						opWr_oneLine(
							'Characteristic length',
							'l_{cs} = \\text{min}\\left( 0.75 \\cdot s_{r,max}, h\\right)'
						)
					);
					// output.push(
					// 	'Characteristic length: \\( l_{cs} = \\text{min}\\left( 0.75 \\cdot s_{r,max}, h\\right)  \\) '
					// );
				}
			}
		}

		return {
			A_s_eff: A_s_eff,
			A_ct_eff: A_c_eff,
			d_eff: d_eff,
			E_cm_eff: Ecm,
			f_ctm_eff: f_ctm,
			Eq_dia: eq_dia,
			E_s: E_s,
			alpha_e: alpha_e,
			l_f: l_f,
			f_Ftsk: f_Ftsk,
			f_Ftuk: f_Ftuk,
			cover_layer: cover_layer,
			h_ct: h_ct,
			s_max: s_max,
			l_cs: l_cs,
			rho_tc: rho_tc,
			documentation: output,
		};
	}

	gamma(limit_state = this.SectionForces.Verification) {
		// SLS : default
		let gamma = {
			c: 1.0,
			ct: 1.0,
			s: 1.0,
			m: 1.0,
			v: 1.0,
		};

		if (limit_state === 'ULS') {
			gamma.c = 1.5;
			gamma.ct = 1.5;
			gamma.s = 1.15;
			gamma.m = 1.5;
			gamma.v = 1.4;

			if (this.AnalysisParameters.NationalAnnex === 'DK NA') {
				gamma.s = 1.2;
				gamma.c = 1.45;
				gamma.ct = 1.7;
			}
		} else if (limit_state === 'ALS') {
			gamma.c = 1.2;
			gamma.ct = 1.2; // DK NA for ALS???
			gamma.s = 1.0;
			gamma.m = 1.2;
			gamma.v = 1.2; // ???
		} else if (limit_state === 'Real') {
			gamma.c = 25 / (25 + 8);
			gamma.ct = 0.7;
			gamma.s = 1.0; // ??
			gamma.m = 0.7;
			gamma.v = 1.0; // ???
		}

		return gamma;
	}

	DocumentCalcs() {
		let Output = [];

		let gamma = this.gamma();

		Output.push('Calculated using the following partial coefficients: ');
		Output.push(
			'\\( \\gamma_{c} = ' +
				gamma.c +
				' \\qquad' +
				' \\gamma_{s} = ' +
				gamma.s +
				' \\qquad ' +
				'\\gamma_{f} = ' +
				gamma.m +
				' \\)'
		);

		return Output;
	}

	minimumReinf(sigma_s = this.Reinforcement.Material.f_yk) {
		// calculate the minimum reinforcement as per EN1992 - 7.3.2 // fib MC2010 - 7.7.4.3
		// optional input: steel stress, default equal to yield stress (lower may be needed)

		// concrete tensile stress:
		let f_ct_eff = this.Geometry.Uniform_material.f_ctm;

		// calculate the stress destribution at first crack:
		let CrackingMoment = this.getCrackingMoment(f_ct_eff);
		// Area of concrete in compression
		let A_ct = CrackingMoment.A_ct;

		// needs something to differentiate between flanges and webs:

		// cross section height:
		let h = this.Geometry.height;
		let h_star = Math.min(h, 1000);

		// k kactors:
		let k = Math.max(0.65, Math.min(1, 1 - ((h - 300) * 0.35) / 500));

		let k1 = 1.5;
		if (this.SectionForces.N > 0) {
			k1 = (2 / 3) * (h_star / h);
		}

		// average stress:
		let sigma_c = -this.SectionForces.N / this.A_c_total;

		// pure tension or bending
		let k_c = 1;

		// rectangular and/or webs:
		if ((CrackingMoment.behavior = 'bending')) {
			k_c = Math.min(1, 0.4 * (1 - sigma_c / (k1 * (h / h_star) * f_ct_eff)));
		}

		// flanges: - PENDING!
		// k_c = Math.max(0.5,0.9 * (F_cr/(A_ct*f_ct_eff)))

		// Mean fibre strength:
		// f_Ftsk = this.Geometry.Uniform_fibres.f_Ftsk
		// f_Ftsm = f_Ftsk / 0.7
		let f_Ftsm = this.Geometry.Uniform_fibres.f_R1 * 0.45;

		// Minimum reinforcement:
		let As_min = (k * k_c * (f_ct_eff - f_Ftsm) * A_ct) / sigma_s;

		// console.log(CrackingMoment);
		let verified = CrackingMoment.A_st >= As_min;
		return { As_min: As_min, verified: verified };
	}

	getCrackingMoment(f_ct_eff = this.Geometry.Uniform_material.f_ctm, withHeighFactor = false) {
		// get bending moment at first crack at defined tensile strengh of concrete
		// (assumed linear elastic concrete)

		// initilize sub analysis:

		// apply height factor is required_
		let height_factor = Math.max(1, 1.6 - this.Geometry.height / 1000);
		if (withHeighFactor === false) height_factor = 1;

		// Cracking moment with SLS verification
		let SectionForces = {
			N: this.SectionForces.N,
			Mz: this.SectionForces.Mz,
			// coming soon:
			Vz: 0,
			My: this.SectionForces.My,
			Vy: 0,
			T: 0,
			eps_sh: 0,
			Verification: 'SLS', // ---- coming soon!
		};

		// sub-analysis:
		let sub_analysis = new CrossSectionAnalysis(this.Geometry, this.Reinforcement, {
			Code: this.AnalysisParameters.Code,
			NationalAnnex: this.AnalysisParameters.NationalAnnex,
			Rely_on_Conc_tens: true,
			Concrete_stress_function: 'elastic',
			Strain_harden: this.AnalysisParameters.Strain_harden, // Allow for strain hardening of reinforcement.
			max_iterations: this.AnalysisParameters.max_intertions, // Maximum allowable iterations to find solution before stopping (Default = 1000)
			crack_limit: this.AnalysisParameters.crack_limit, // Design crack width - for SLS only
		}); // recursion!

		// try with very low initial curvature
		let kappa = -1e-10 * Math.sign(SectionForces.Mz);
		sub_analysis.Solve_with_kappa(SectionForces, kappa, false);

		// get maximum stress with initial analysis
		let sig_c_max = sub_analysis.sig_c_max;

		let sig_c_avg = sub_analysis.sig_c_avg;

		// factor to match crack stress
		let factor = (f_ct_eff * height_factor - sig_c_avg) / (sig_c_max - sig_c_avg);

		kappa = factor * kappa;
		SectionForces.Verification = 'Real';
		sub_analysis.Solve_with_kappa(SectionForces, kappa, false);

		let M = sub_analysis.Mz;

		let sig_c_min = sub_analysis.sig_c_min;
		let behavior = 'bending';
		if (sig_c_min > 0) behavior = 'pure tension';

		// get area in tension:
		let A_ct = 0;
		for (let i = 0; i < sub_analysis.sig_c.length; i++) {
			if (sub_analysis.sig_c[i] >= 0) {
				A_ct += sub_analysis.A_c[i];
			}
		}

		let A_st = 0;
		for (let i = 0; i < sub_analysis.sig_s.length; i++) {
			if (sub_analysis.sig_s[i] >= -1.0) {
				// -1 to include steel with very small negative stresses: i.e near the centroid
				A_st += sub_analysis.A_s[i];
			}
		}
		return {
			M_cr: M,
			kappa_cr: kappa,
			A_ct: A_ct,
			A_st: A_st,
			behavior: behavior,
		};
	}

	copy(copyStressState = false) {
		let sub_analysis = new CrossSectionAnalysis(
			this.Geometry,
			this.Reinforcement,
			this.AnalysisParameters
		);
		let SF = { ...this.SectionForces };
		let kappa = 0;
		kappa += this.kappa;
		sub_analysis.SectionForces = SF;
		sub_analysis.kappa = kappa;

		if (copyStressState) {
			if (this.state === 'Solved with M') {
				sub_analysis.Solve_with_M(SF, false);
				sub_analysis.getShearCapacity(SF);
			} else if (this.state === 'Solved with Kappa') {
				sub_analysis.Solve_with_kappa(SF, kappa, false);
				sub_analysis.getShearCapacity(SF);
			}
		}

		return sub_analysis;
	}
}

// function to export to csv
export function exportToCsv(filename, rows) {
	var processRow = function (row) {
		var finalVal = '';
		for (var j = 0; j < row.length; j++) {
			var innerValue = row[j] === null ? '' : row[j].toString();
			if (row[j] instanceof Date) {
				innerValue = row[j].toLocaleString();
			}
			var result = innerValue.replace(/"/g, '""');
			if (result.search(/("|,|\n)/g) >= 0) result = '"' + result + '"';
			if (j > 0) finalVal += ',';
			finalVal += result;
		}
		return finalVal + '\n';
	};

	var csvFile = '';
	for (var i = 0; i < rows.length; i++) {
		csvFile += processRow(rows[i]);
	}

	var blob = new Blob([csvFile], { type: 'text/csv;charset=utf-8;' });
	if (navigator.msSaveBlob) {
		// IE 10+
		navigator.msSaveBlob(blob, filename);
	} else {
		var link = document.createElement('a');
		if (link.download !== undefined) {
			// feature detection
			// Browsers that support HTML5 download attribute
			var url = URL.createObjectURL(blob);
			link.setAttribute('href', url);
			link.setAttribute('download', filename);
			link.style.visibility = 'hidden';
			document.body.appendChild(link);
			link.click();
			document.body.removeChild(link);
		}
	}
}
