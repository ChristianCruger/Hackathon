export default class docWriter {
	// documentation writer class.
	// converts input strings to HTML with corresponding divs
	storage: string[];
	// divClass: string;
	childClass: string;
	childClassFull: string;
	allowAllignment: boolean;
	allowLocalStyling: boolean;

	#classString: string;
	#styleObject: { [k: string]: any };
	#styleString: string;
	#childAllignment: allignmentString[];
	#childStyle: string[];
	#rowWidthValue: number[];

	constructor(parentClass = 'row nobreak align-items-center') {
		this.parentClass = parentClass;
		this.storage = [];

		this.allowAllignment = false; // set to false,
		this.allowLocalStyling = true;
		this.style = {
			// color: 'blue',
			// 'text-allign' : 'right'
		};

		this.#rowWidthValue = [];
		this.#childStyle = [''];
		this.#childAllignment = ['center'];
		this.rowWidth = 100; // %
		this.childClass = 'col';
		this.childClassFull = 'col_full';
	}

	set rowWidth(width: number[] | number) {
		if (typeof width === 'number') {
			this.#rowWidthValue.push(width);
		} else {
			this.#rowWidthValue = [];
			width.forEach((w) => {
				this.#rowWidthValue.push(w);
			});
		}

		//regen style strings:
		this.allignChildren = this.#childAllignment;
	}

	set allignChildren(stringArray: allignmentString[] | allignmentString) {
		if (this.allowAllignment) {
			if (typeof stringArray === 'string') {
				this.#childAllignment = [stringArray];
				this.#childStyle = [`style="text-align:${stringArray};width:${this.#rowWidthValue[0]}%"`];
			} else {
				// array of inputs:
				this.#childAllignment = stringArray;
				this.#childStyle = [];
				let idx = 0;
				let max_idx = this.#rowWidthValue.length - 1;
				stringArray.forEach((string) => {
					this.#childStyle.push(
						`style="text-align:${string};width:${this.#rowWidthValue[Math.min(idx, max_idx)]}%"`
					);
					idx++;
				});
			}
		}
	}

	set parentClass(divClass: string) {
		this.#classString = `class="${divClass}"`;
	}

	set style(object: { [k: string]: any }) {
		this.#styleObject = object;

		if (this.allowLocalStyling) {
			//generate style string with key-value pairs:
			this.#styleString = 'style="';
			Object.keys(object).forEach((key) => {
				this.#styleString += `${key}:${object[key]};`;
			});
			this.#styleString += '"';
		} else {
			this.#styleString = '';
		}
	}

	addStyle(styleObject: { [k: string]: any }) {
		// add style entries to existing style
		let oldStyle = this.#styleObject;

		Object.keys(styleObject).forEach((key) => {
			oldStyle[key] = styleObject[key];
		});

		this.style = oldStyle;
	}

	get rowWidth() {
		return this.#rowWidthValue;
	}

	get style() {
		return this.#styleObject;
	}

	get allignChildren() {
		return this.#childAllignment;
	}

	get length() {
		return this.storage.length;
	}

	get lastEntry() {
		return this.storage[this.storage.length - 1];
	}

	write = (
		StringArray: (string | number)[] | string,
		HTMLcontainer = '',
		startWithCapitalLetter = true,
		writeEvenSpaced = false,
		containerClass = ''
	) => {
		let string = `<div ${this.#classString} ${this.#styleString}>`;
		if (HTMLcontainer !== '') {
			let classStr = '';
			if (containerClass !== '') classStr = ` class="${containerClass}"`;
			string += `<${HTMLcontainer}${classStr}>`;
		}
		if (typeof StringArray === 'string') {
			if (startWithCapitalLetter) {
				StringArray = StringArray.charAt(0).toUpperCase() + StringArray.slice(1);
			}

			string += StringArray;
		} else {
			if (StringArray.length === 1) {
				string += `<div class="${this.childClassFull}" ${this.#childStyle[0]}>${
					StringArray[0]
				}</div>`;
			} else {
				let i = 1;

				let max_i = this.#childStyle.length - 1;

				StringArray.forEach((str) => {
					if (typeof str === 'string' && i === 0 && startWithCapitalLetter) {
						str = str.charAt(0).toUpperCase() + str.slice(1);
					}

					if (writeEvenSpaced) {
						string += `<div ${this.#childStyle[Math.min(i, max_i)]}>${str}</div>`;
					} else {
						string += `<div ${this.#childStyle[Math.min(i, max_i)]} class="${
							this.childClass
						}${i}">${str}</div>`;
					}

					i++;
				});
				// console.log(this.#childStyle);
			}
		}

		if (HTMLcontainer !== '') string += `</${HTMLcontainer}>`;
		string += '</div>';

		this.storage.push(string);
	};

	writeTitleTwo(StringArray: string[] | string, pagebreak = true) {
		if (pagebreak) {
			this.write(StringArray, 'h2');
		} else {
			this.write(StringArray, 'h2', true, false, 'no-break');
		}
	}

	writeTitle(StringArray: string[] | string) {
		this.write(StringArray, 'h3');
	}

	writeHeader(StringArray: string[] | string, headerlevel = 3) {
		this.write(StringArray, `h${headerlevel}`);
	}

	tableWriter = (header_names: string[], values: any[][]) => {
		let table_string = `<div class="table-responsive">
								<table class="table table-padding">
									<thead class="thead-orange-output">
										<tr>`;

		header_names.forEach((header_name) => {
			table_string += `<th style="text-align: left; vertical-align: middle;">${header_name}</th>`;
		});

		table_string += `</tr></thead><tbody>`;

		for (let i = 0; i < values.length; i++) {
			if (values[i].includes(false)) continue; //TODO: this might have to change at some point to allow for false
			table_string += `<tr>`;
			for (let j = 0; j < values[i].length; j++) {
				if (typeof values[i][j] === 'boolean')
					table_string += `<td>${this.styleBoolean(values[i][j])}</td>`;
				else table_string += `<td>${values[i][j]}</td>`;
			}
			table_string += `</tr>`;
		}

		table_string += `</tbody></table></div>`;

		this.storage.push(table_string);
	};

	styleBoolean(bool: boolean) {
		if (bool) return `<i class="text-success far fa-2x fa-check-circle"></i>`;
		else return `<i class="text-danger far fa-2x fa-times-circle"></i>`;
	}

	lineBreak() {
		this.storage.push('<br>');
	}

	print() {
		// concat storage array to single string output
		if (this.storage.length === 0) return;

		let combinedString = this.storage.reduce((a, b) => a + b);
		return combinedString;
	}

	push(strings: string[] | string) {
		// old school string push
		if (typeof strings === 'string') {
			this.storage.push(strings);
		} else {
			strings.forEach((str) => {
				this.storage.push(str);
			});
		}
	}

	concat(otherDocWriter: docWriter) {
		for (let i = 0; i < otherDocWriter.length; i++) {
			this.push(otherDocWriter.storage[i]);
		}
	}
}

type allignmentString = 'left' | 'right' | 'center';
