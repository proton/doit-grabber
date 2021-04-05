import Q from 'q';
const _ = require('lodash');
import moment from 'moment';
import naturalSort from 'javascript-natural-sort';
// const fs = require('fs-extra');

const nextContextName = 'Next';
const somedayContextName = 'Someday';
const waitingContextName = 'Waiting';

const todoist = require('todoist').v8

export default class GrabberLogic {
	static async sync(lib, argv) {
		const todoistApi = todoist(argv.todoistToken);
		await this.syncProjects(lib, todoistApi);
		await this.syncContexts(lib, todoistApi);
		await this.syncTasks(lib, todoistApi);
	}

	static formatName(name) {
		return name.replace(/[\(\)]/g, '_')
	}

	static async syncProjects(doitLib, todoistApi) {
		await todoistApi.sync();

		const doitProjects = await doitLib.getProjects();
		const doitProjectNames = Object.values(doitProjects).map(this.formatName);
		doitProjectNames.push('Inbox');
		
		const todoistProjects = todoistApi.projects.get();
		const todoistProjectNames = todoistProjects.map(project => project.name);
		
		const missingProjectNames = [...new Set(doitProjectNames.filter(name => !todoistProjectNames.includes(name)))];

		for (const name of missingProjectNames) {
			await todoistApi.projects.add({ name: name });
		}

		await todoistApi.commit();
	}

	static async syncContexts(_doitLib, todoistApi) {
		await todoistApi.sync();

		const contextNames = [nextContextName, somedayContextName, waitingContextName];

		// add labels
		const todoistLabels = todoistApi.labels.get();
		for (const name of contextNames) {
			const label = todoistLabels.find(l => l.name.includes(name));
			if (!label) {
				await todoistApi.labels.add({ name: name, favorite: true });
			}
		}

		// add sections
		const todoistSections = todoistApi.sections.get();
		const todoistProjects = todoistApi.projects.get();
		for (const project of todoistProjects) {
			for (const name of contextNames) {
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

		let projectMap = {};
		const doitProjects = await doitLib.getProjects();
		let doitTasks = await doitLib.getAllTasks();
		doitTasks = doitTasks.filter(t => t.completed === 0 && t.archived === 0 && t.hidden === 0);
		const todoistSections = todoistApi.sections.get();
		const todoistProjects = todoistApi.projects.get();
		const todoistTasks = todoistApi.items.get();
		const todoistNotes = todoistApi.notes.get();

		console.log(doitTasks);
		console.log(doitTasks.length);

		await todoistApi.commit();
	}
}
