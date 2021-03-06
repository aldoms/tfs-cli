

import { CreationResult, createExtension } from "./create";
import { Merger } from "./_lib/merger";
import { VsixManifestBuilder } from "./_lib/vsix-manifest-builder";
import { MergeSettings, PackageSettings } from "./_lib/interfaces";
import { VsixWriter } from "./_lib/vsix-writer";
import { TfCommand } from "../../lib/tfcommand";
import colors = require("colors");
import extBase = require("./default");
import extInfo = require("./_lib/extensioninfo");
import galleryifm = require('vso-node-api/interfaces/GalleryInterfaces');
import Q = require("q");
import qfs = require("../../lib/qfs");
import publishUtils = require("./_lib/publish");
import trace = require('../../lib/trace');

export function getCommand(args: string[]): TfCommand<extBase.ExtensionArguments, ExtensionPublishResult> {
	return new ExtensionPublish(args);
}

export interface ExtensionCreateArguments {
	outputpath: string;
	root?: string;
	locRoot?: string;
	manifestglob?: string[];
	settings?: string;
	override?: any;
	publisher?: string;
	extensionid?: string;
	bypassvalidation?: boolean
}

export interface ExtensionPublishArguments {

}

export interface ExtensionPublishResult {
	packaged: string;
	published: boolean;
	shared: string[];
}

export class ExtensionPublish extends extBase.ExtensionBase<ExtensionPublishResult> {
	protected description = "Publish a Visual Studio Marketplace Extension.";
	protected serverCommand = true;

	protected getHelpArgs(): string[] {
		return ["root", "manifests", "manifestGlobs", "override", "overridesFile", "bypassValidation", "publisher", "extensionId", "outputPath", "locRoot",
			"vsix", "shareWith"];
	}

	public exec(): Promise<ExtensionPublishResult> {
		let galleryApi = this.webApi.getGalleryApi(this.webApi.serverUrl);
		let result = <ExtensionPublishResult>{};
		return this.getPublishSettings().then<ExtensionPublishResult>((publishSettings) => {
			let extensionCreatePromise: Promise<string>;
			if (publishSettings.vsixPath) {
				result.packaged = null;
				extensionCreatePromise = Q.resolve(publishSettings.vsixPath);
			} else {
				extensionCreatePromise = this.getMergeSettings().then((mergeSettings) => {
					return this.getPackageSettings().then((packageSettings) => {
						return createExtension(mergeSettings, packageSettings);
					});
				}).then((createResult) => {
					result.packaged = createResult.path;
					return createResult.path;
				});
			}
			return extensionCreatePromise.then<ExtensionPublishResult>((vsixPath) => {
				publishSettings.vsixPath = vsixPath;
				let packagePublisher = new publishUtils.PackagePublisher(publishSettings, galleryApi);
				return packagePublisher.publish().then((ext) => {
					result.published = true;
					if (publishSettings.shareWith && publishSettings.shareWith.length >= 0) {
						let sharingMgr = new publishUtils.SharingManager(publishSettings, galleryApi);
						return sharingMgr.shareWith(publishSettings.shareWith).then(() => {
							result.shared = publishSettings.shareWith;
							return result;
						});
					} else {
						result.shared = null;
						return result;
					}
				});
			});
		});
	}

	protected friendlyOutput(data: ExtensionPublishResult): void {
		trace.info(colors.green("\n=== Completed operation: publish extension ==="));
		let packagingStr = data.packaged ? colors.green(data.packaged) : colors.yellow("not packaged (existing package used)");
		let publishingStr = data.published ? colors.green("success") : colors.yellow("???");
		let sharingStr = data.shared ? "shared with " + data.shared.map(s => colors.green(s)).join(", ") : colors.yellow("not shared (use --share-with to share)");
		trace.info(" - Packaging: %s", packagingStr);
		trace.info(" - Publishing: %s", publishingStr);
		trace.info(" - Sharing: %s", sharingStr);
	}
}