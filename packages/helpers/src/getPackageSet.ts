import * as fsExtra from 'fs-extra'
import * as path from 'path'
import globby from 'globby'
import {NormalizedPkg, getPackageJson} from './getPackageJson'
import {HelpersError} from './interfaces'
import {getAdvancedInfo, AdvancedInfo} from './getAdvancedInfo'
import {Env, getEnv} from './nameHelpers'

export class GetPackageSetError extends HelpersError {}

export interface LernaJson {
    packages: string[]
}

function getLernaPackages(repoRoot: string): Promise<NormalizedPkg[]> {
    const lernaConfigPath = path.join(repoRoot, 'lerna.json')
    return fsExtra.pathExists(lernaConfigPath)
        .then(exists => exists ? fsExtra.readJson(lernaConfigPath): null)
        .then((lernaConfig?: LernaJson) => lernaConfig && lernaConfig.packages
            ? globby(lernaConfig.packages + '/package.json', {absolute: true})
            : []
        )
        .then((pkgFiles: string[]) => pkgFiles.length
            ? Promise.all(pkgFiles.sort().map(getPackageJson))
            : []
        )
}

function getGlobals(pkgs: NormalizedPkg[]): Record<string, string> {
    return pkgs.reduce((acc, {json: {name}, globalName}) => {
        acc[name] = globalName
        return acc
    }, {})
}

function getAliases(
    {packages, pkg: {json: {name, rollup}, srcDir}, env}: {
        pkg: NormalizedPkg
        env?: Env | void
        packages?: NormalizedPkg[]
    }
): Record<string, string> {
    const aliases: Record<string, string> = (packages || []).reduce(
        (acc, {json: {module, name, main}, pkgPath}) => {
            const modPath = module || main
            return modPath
                ? {
                    ...acc,
                    [name]: path.join(path.dirname(pkgPath), modPath)
                }
                : acc
        },
        {}
    )
    if (srcDir) {
        aliases[name] = srcDir
        aliases['~'] = srcDir
    }

    if (env === 'production') (rollup.productionStubs || []).forEach(stub => aliases[stub] = 'empty/object')

    return aliases
}

export function getPackageSet(
    {pkgRoot, selectedNames, oneOfHost, env: rawEnv}: {
        pkgRoot: string
        env?: string | void
        oneOfHost?: string[] | void
        selectedNames?: string[] | void
    }
): Promise<AdvancedInfo[]> {
    const env: Env | void = rawEnv ? getEnv(rawEnv) : undefined

    return getLernaPackages(pkgRoot)
        .then(packages => packages.length === 0
            ? Promise.all([getPackageJson(pkgRoot)])
            : packages
        )
        .then(packages => {
            const selectedPackages = selectedNames
                ? packages.filter(pkg =>
                    selectedNames.indexOf(path.basename(pkg.pkgRoot)) !== -1
                )
                : packages
            const globals = getGlobals(packages)

            return Promise.all(selectedPackages.map(pkg =>
                getAdvancedInfo({
                    pkg,
                    env,
                    aliases: getAliases({packages, env, pkg}),
                    globals,
                    oneOfHost
                })
            ))
        })
}