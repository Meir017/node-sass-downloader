// @ts-check

const request = require('request-promise');
const fs = require('fs');
const path = require('path');

class Downloader {
    constructor({
        downloadsDirectory,
        downloadParallelism,
        version
    }) {
        this.downloadsDirectory = downloadsDirectory;
        this.downloadParallelism = downloadParallelism;

        this.version = version;
    }

    async download() {
        if (!fs.existsSync(this.downloadsDirectory)) fs.mkdirSync(this.downloadsDirectory);

        const downloads = [];
        let i = 0;

        const assets = await this.getDownloadAssets();
        console.log('downloading release assets', {
            assets: assets.length,
            version: this.version
        });

        for (const { name, url } of assets) {
            console.log('downloading asset...', { name });

            downloads.push(this.downloadFile(name, url).then(() => {
                console.log('downloaded asset', { name });
            }));

            if (downloads.length % this.downloadParallelism === 0) {
                await Promise.all(downloads);
            }

            ++i;
        }
        await Promise.all(downloads);
    }

    async getDownloadAssets() {
        return [];
    }

    downloadFile(filename, url) {
        return new Promise(async (resolve, reject) => {
            const fullPath = path.join(this.downloadsDirectory, filename);
            if (fs.existsSync(fullPath) && fs.statSync(fullPath).size === 0) {
                console.log('empty file, deleting and retrying', { filename });
                fs.unlinkSync(fullPath);
            } else if (fs.existsSync(fullPath)) {
                console.log('file already exists', { filename });
                return;
            }
            const stream = request(url, { resolveWithFullResponse: true, encoding: null })
                .pipe(fs.createWriteStream(fullPath));
            stream.on('finish', resolve);
            stream.on('error', reject);
        });
    }
}

class GitHubDownloader extends Downloader {

    constructor({
        downloadsDirectory,
        downloadParallelism,
        version,
        username,
        repository
    }) {
        super({ downloadsDirectory, downloadParallelism, version })
        this.username = username;
        this.repository = repository;
    }

    async getDownloadAssets() {
        const baseUrl = `https://api.github.com/repos/${this.username}/${this.repository}/releases/tags`;
        const tagUrl = `${baseUrl}/${this.version}`;
        const downloadsDirectory = `./${this.repository}-assets`;

        if (!fs.existsSync(downloadsDirectory)) fs.mkdirSync(downloadsDirectory);

        const release = await request(tagUrl, {
            json: true,
            headers: {
                'User-Agent': `download-${this.repository}`
            }
        });

        console.log('downloading release assets', {
            assets: release.assets.length,
            version: this.version
        });

        return release.assets.map(asset => ({
            name: asset.name,
            url: asset.browser_download_url
        }));
    }
}

class CypressDownloader extends Downloader {
    constructor({
        downloadsDirectory,
        downloadParallelism,
        version,
    }) {
        super({ downloadsDirectory, downloadParallelism, version });
    }

    async getDownloadAssets() {
        const cypressUrl = 'https://download.cypress.io/desktop.json/';
        const cypressPackages = await request(cypressUrl, { json: true });

        const versionPlaceholder = cypressPackages.version;
        return Object.entries(cypressPackages.packages).map(([key, value]) => ({
            name: key,
            url: value.url.replace(versionPlaceholder, this.version)
        }));
    }
}

module.exports = {
    Downloader,
    GitHubDownloader,
    CypressDownloader
};