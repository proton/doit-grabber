import Q from 'q';
const _ = require('lodash');
import moment from 'moment';
import naturalSort from 'javascript-natural-sort';
// const fs = require('fs-extra');

const nextBoxName = 'Next';
const somedayBoxName = 'Someday';
const waitingBoxName = 'Waiting';

const todoist = require('todoist').v8

export default class GrabberLogic {
	static async sync(lib, argv) {
		const todoistApi = todoist(argv.todoistToken);
		await this.syncProjects(lib, todoistApi);
		await this.syncProjectNotes(lib, todoistApi);
		await this.syncTags(lib, todoistApi);
		await this.syncContexts(lib, todoistApi);
		await this.syncBoxes(lib, todoistApi);
		await this.syncTasks(lib, todoistApi);
	}

	static formatName(name) {
		return name.replace(/[\(\)]/g, '_')
	}

	static async syncProjects(doitLib, todoistApi) {
		await todoistApi.sync();

		let doitProjects = await doitLib.getProjects();
		doitProjects.push({ name: 'Inbox' });
		
		const todoistProjects = todoistApi.projects.get();

		for (const doitProject of doitProjects) {
			const todoistProject = todoistProjects.find(p => this.formatName(p.name) == this.formatName(doitProject.name));
			if (!todoistProject) {
				await todoistApi.projects.add({ name: this.formatName(doitProject.name) });
			}
		}

		await todoistApi.commit();
	}

	static async syncProjectNotes(doitLib, todoistApi) {
		await todoistApi.sync();

		let doitProjects = await doitLib.getProjects();
		
		const todoistProjects = todoistApi.projects.get();
		const todoistProjectNotes = todoistApi.projectNotes.get();

		for (const doitProject of doitProjects) {
			const todoistProject = todoistProjects.find(p => this.formatName(p.name) == this.formatName(doitProject.name));
			if (todoistProject && doitProject.notes) {
				const todoistProjectNote = todoistProjectNotes.find(n => n.project_id == todoistProject.id)
				if (!todoistProjectNote) {
					// Error: An invalid sync command was sent
					// await todoistApi.projectNotes.add({ content: doitProject.notes.replace(/\s+/g, ' '), project_id: todoistProject.id });
				}
			}
		}

		await todoistApi.commit();
	}

	static async syncTags(doitLib, todoistApi) {
		await todoistApi.sync();

		const doitTasks = await doitLib.getAllTasks();
		let tags = doitTasks.filter(t => t.tags).flatMap(t => t.tags);
		tags = [...new Set(tags)];

		const todoistLabels = todoistApi.labels.get();
		for (const name of tags) {
			const label = todoistLabels.find(l => this.formatName(l.name) === this.formatName(name));
			if (!label) {
				await todoistApi.labels.add({ name: this.formatName(name) });
			}
		}

		await todoistApi.commit();
	}

	static async syncContexts(doitLib, todoistApi) {
		await todoistApi.sync();

		const doitContexts = await doitLib.getContexts();
		let contexts = doitContexts.map(c => c.name);

		const todoistLabels = todoistApi.labels.get();
		for (const name of contexts) {
			const label = todoistLabels.find(l => this.formatName(l.name) === this.formatName(name));
			if (!label) {
				await todoistApi.labels.add({ name: this.formatName(name) });
			}
		}

		await todoistApi.commit();
	}

	static async syncBoxes(_doitLib, todoistApi) {
		await todoistApi.sync();

		const boxNames = [nextBoxName, somedayBoxName, waitingBoxName];

		// add labels
		const todoistLabels = todoistApi.labels.get();
		for (const name of boxNames) {
			const label = todoistLabels.find(l => l.name.includes(name));
			if (!label) {
				await todoistApi.labels.add({ name: name, favorite: true });
			}
		}

		// add sections
		const todoistSections = todoistApi.sections.get();
		const todoistProjects = todoistApi.projects.get();
		for (const project of todoistProjects) {
			for (const name of boxNames) {
				const section = todoistSections.find(s => s.name == name && s.project_id == project.id);
				if (!section) {
					await todoistApi.sections.add({ name: name, project_id: project.id });
				}
			}
		}

		await todoistApi.commit();
	}

	static async syncTasks(doitLib, todoistApi) {
		await todoistApi.sync();

		const doitProjects = await doitLib.getProjects();
		let doitTasks = await doitLib.getAllTasks();
		doitTasks = doitTasks.filter(t => t.completed === 0 && t.archived === 0 && t.hidden === 0);
		const doitContexts = await doitLib.getContexts();
		const todoistSections = todoistApi.sections.get();
		const todoistProjects = todoistApi.projects.get();
		const todoistTasks = todoistApi.items.get();
		const todoistNotes = todoistApi.notes.get();
		const todoistLabels = todoistApi.labels.get();

		const projectMap = {};
		for (const doitProject of doitProjects) {
			const project = todoistProjects.find(p => this.formatName(p.name) === this.formatName(doitProject.name));
			if (!project) throw `project with name "${doitContext.name}" not found`;
			projectMap[doitProject.uuid] = project.id;
		}
		const inboxProjectId = todoistProjects.find(p => p.name === "Inbox").id;

		const contextMap = {};
		for (const doitContext of doitContexts) {
			const label = todoistLabels.find(l => this.formatName(l.name) === this.formatName(doitContext.name));
			if (!label) throw `label with name "${doitContext.name}" not found`;
			contextMap[doitContext.uuid] = label.id;
		}

		const tagsMap = {};
		for (const doitTask of doitTasks) {
			if (!doitTask.tags) continue;
				for (const tag of doitTask.tags) {
				const label = todoistLabels.find(l => this.formatName(l.name) === this.formatName(tag));
				if (!label) throw `label with name "${tag}" not found`;
				tagsMap[tag] = label.id;
			}
		}

		for (const doitTask of doitTasks) {
			console.log(doitTask);

			const task = {};
			task.content = doitTask.title;
			task.project_id = projectMap[doitTask.project] || inboxProjectId;
			task.label_ids = [];
			let boxName;
			if (doitTask.attribute == 'next') boxName = nextBoxName;
			else if (doitTask.attribute == 'waiting') boxName = waitingBoxName;
			else if (doitTask.attribute == 'noplan') boxName = somedayBoxName;
			if (boxName) {
				task.section_id = todoistSections.find(s => s.name == boxName && s.project_id == task.project_id);
				const label_id = todoistLabels.find(l => l.name.includes(boxName));
				task.label_ids = [label_id];
			}
			if (doitTask.context) {
				const label_id = contextMap[doitTask.context];
				task.label_ids.push(label_id);
			}
			if (doitTask.tags) {
				const label_ids = doitTask.tags.map(t => tagsMap[t]);
				task.label_ids = task.label_ids.concat(label_ids);
			}
			task.priority = doitTask.priority + 1;

			// due_date
			// due_datetime

			console.log(task);

			// {
			// 	attribute: 'noplan',
			// 	all_day: true,
			// 	start_at: 0,
			// 	end_at: 0,
			// }

			// + note!!!
		}

		await todoistApi.commit();
	}
}
