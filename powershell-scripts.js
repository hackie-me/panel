// This will contain the PowerShell scripts as embedded strings
const POWERSHELL_SCRIPTS = {
    replacePackageReferences: `
param(
    [string]$ProjectsPath = "D:\\Projects",
    [string]$InfrastructurePath = "D:\\Projects\\KLSPL.Community.Common.Infrastructure",
    [switch]$WhatIf = $false
)
function Write-ColorOutput {
    param([string]$Message, [string]$Color = "White")
    Write-Host $Message -ForegroundColor $Color
}

function Get-RelativePath {
    param([string]$From, [string]$To)
    
    $From = $From.TrimEnd('\\')
    $To = $To.TrimEnd('\\')
    $fromParts = $From -split '\\\\'
    $toParts = $To -split '\\\\'
    
    $commonLength = 0
    $minLength = [Math]::Min($fromParts.Length, $toParts.Length)
    
    for ($i = 0; $i -lt $minLength; $i++) {
        if ($fromParts[$i] -eq $toParts[$i]) {
            $commonLength++
        } else {
            break
        }
    }
    
    $relativeParts = @()
    for ($i = $commonLength; $i -lt $fromParts.Length; $i++) {
        $relativeParts += ".."
    }
    for ($i = $commonLength; $i -lt $toParts.Length; $i++) {
        $relativeParts += $toParts[$i]
    }
    
    if ($relativeParts.Length -eq 0) {
        return "."
    }
    
    return $relativeParts -join "\\"
}

function Get-InfrastructureProjects {
    Write-ColorOutput "Discovering infrastructure projects..." "Cyan"
    
    $infraProjects = @{}
    $infraDirs = Get-ChildItem -Path $InfrastructurePath -Directory
    
    foreach ($dir in $infraDirs) {
        $csprojFiles = Get-ChildItem -Path $dir.FullName -Filter "*.csproj"
        if ($csprojFiles.Count -gt 0) {
            Write-ColorOutput "  Found: $($dir.Name) -> $($csprojFiles[0].Name)" "Green"
            $infraProjects[$dir.Name] = $csprojFiles[0].FullName
        }
    }
    
    return $infraProjects
}

function Create-PackageMapping {
    param([hashtable]$InfraProjects)
    
    Write-ColorOutput "\`nCreating package to project mapping..." "Cyan"
    $packageMapping = @{}
    
    $packageToDir = @{
        "KLSPL.Community.Common.Infrastructure" = "KLSPL.Infrastructure"
        "KLSPL.Community.Common.CacheLibrary" = "KLSPL.CacheLibrary"
        "KLSPL.Community.Common.DomainLibrary" = "KLSPL.DomainLibrary"
        "KLSPL.Community.Common.SerilogLibrary" = "KLSPL.SerilogLibrary"
        "KLSPL.Community.Common.ThreadPoolLibrary" = "KLSPL.ThreadPool"
        "KLSPL.Community.Common.Application.Core" = "KLSPL.Common.Application.Core"
        "KLSPL.Community.Common.Infrastructure.MassTransit" = "KLSPL.Common.Infrastructure.MassTransit"
        "KLSPL.Community.Common.HangFireLibrary" = "KLSPL.HangFireLibrary"
        "KLSPL.Community.Common.OpenTelemetryLibrary" = "KLSPL.OpenTelemetryLibrary"
    }
    
    foreach ($packageName in $packageToDir.Keys) {
        $dirName = $packageToDir[$packageName]
        if ($InfraProjects.ContainsKey($dirName)) {
            $packageMapping[$packageName] = $InfraProjects[$dirName]
            Write-ColorOutput "  Mapped: $packageName -> $dirName" "Green"
        }
    }
    
    return $packageMapping
}

function Get-AllDirectories {
    $directories = @()
    
    $communityPath = Join-Path $ProjectsPath "Community"
    if (Test-Path $communityPath) {
        $directories += @{
            Name = "Community"
            Path = $communityPath
            SolutionPath = Join-Path $communityPath "KLSPL.sln"
        }
    }
    
    $apiDirectories = @(
        "KLSPL.Community.EDINotification.API", "KLSPL.Community.Export.API", 
        "KLSPL.Community.Gateway.API", "KLSPL.Community.Hangfire.API",
        "KLSPL.Community.Import.API", "KLSPL.Community.LCCT.API",
        "KLSPL.Community.Master.API", "KLSPL.Community.Passenger.API",
        "KLSPL.Community.PCS.API", "KLSPL.Community.Tariff.API",
        "KLSPL.Community.TSM.API", "KLSPL.Community.WorkFlow.API"
    )
    
    foreach ($apiDir in $apiDirectories) {
        $fullPath = Join-Path $ProjectsPath $apiDir
        if (Test-Path $fullPath) {
            $directories += @{
                Name = $apiDir
                Path = $fullPath
                SolutionPath = Join-Path $fullPath "$apiDir.sln"
            }
        }
    }
    
    return $directories
}

function Select-Directories {
    param([array]$AllDirectories, [string]$Selection = "all")
    
    $selectedIndices = @()
    
    if ($Selection -eq 'all') {
        $selectedIndices = 0..($AllDirectories.Count - 1)
    } elseif ($Selection -eq 'community') {
        for ($i = 0; $i -lt $AllDirectories.Count; $i++) {
            if ($AllDirectories[$i].Name -eq "Community") {
                $selectedIndices += $i
            }
        }
    } elseif ($Selection -eq 'apis') {
        for ($i = 0; $i -lt $AllDirectories.Count; $i++) {
            if ($AllDirectories[$i].Name -ne "Community") {
                $selectedIndices += $i
            }
        }
    } else {
        try {
            $parts = $Selection -split ','
            foreach ($part in $parts) {
                $part = $part.Trim()
                if ($part -match '^\\d+$') {
                    $index = [int]$part
                    if ($index -ge 0 -and $index -lt $AllDirectories.Count) {
                        $selectedIndices += $index
                    }
                }
            }
            $selectedIndices = $selectedIndices | Sort-Object -Unique
        } catch {
            Write-ColorOutput "Invalid selection. Using all directories." "Red"
            $selectedIndices = 0..($AllDirectories.Count - 1)
        }
    }
    
    $selectedDirectories = @()
    foreach ($index in $selectedIndices) {
        $selectedDirectories += $AllDirectories[$index]
    }
    
    return $selectedDirectories
}

function Add-ProjectReference {
    param([string]$ProjectPath, [string]$ReferencePath)
    
    if (-not (Test-Path $ProjectPath) -or -not (Test-Path $ReferencePath)) {
        Write-ColorOutput "        File not found!" "Red"
        return $false
    }
    
    $content = Get-Content $ProjectPath -Raw
    $relativePath = Get-RelativePath -From (Split-Path $ProjectPath) -To $ReferencePath
    $infraProjectName = [System.IO.Path]::GetFileNameWithoutExtension($ReferencePath)
    
    # Check if reference already exists
    if ($content.Contains($relativePath)) {
        Write-ColorOutput "        Already exists: $infraProjectName" "Gray"
        return $false
    }
    
    Write-ColorOutput "        Adding: $infraProjectName" "Green"
    
    if (-not $WhatIf) {
        $newProjectRef = "    <ProjectReference Include=\`"$relativePath\`" />"
        
        # Look for existing ProjectReference ItemGroup
        if ($content -match '<ItemGroup[^>]*>[\\s\\r\\n]*<ProjectReference') {
            # Find the first ProjectReference line and add after it
            $lines = $content -split "\`r\`n"
            $newLines = @()
            $added = $false
            
            for ($i = 0; $i -lt $lines.Length; $i++) {
                $newLines += $lines[$i]
                
                # If this line contains a ProjectReference and we haven't added yet
                if (-not $added -and $lines[$i] -match '<ProjectReference[^>]*/>') {
                    $newLines += $newProjectRef
                    $added = $true
                }
            }
            
            if ($added) {
                $content = $newLines -join "\`r\`n"
            }
        }
        
        # If no existing ProjectReference ItemGroup, create new one
        if (-not ($content -match '<ItemGroup[^>]*>[\\s\\r\\n]*<ProjectReference')) {
            $insertPoint = $content.LastIndexOf('</Project>')
            if ($insertPoint -gt 0) {
                $newItemGroup = "\`r\`n  <ItemGroup>\`r\`n$newProjectRef\`r\`n  </ItemGroup>\`r\`n"
                $content = $content.Insert($insertPoint, $newItemGroup)
            }
        }
        
        # Save the file
        try {
            $content | Out-File -FilePath $ProjectPath -Encoding UTF8 -NoNewline
            Write-ColorOutput "        Successfully added!" "Green"
        } catch {
            Write-ColorOutput "        Failed to save: $($_.Exception.Message)" "Red"
            return $false
        }
    }
    
    return $true
}

function Process-Directory {
    param([hashtable]$Directory, [hashtable]$PackageMapping)
    
    Write-ColorOutput "\`n=== Processing: $($Directory.Name) ===" "Cyan"
    
    # Find all project files
    $persistenceProjects = @()
    $commandProjects = @()
    
    if ($Directory.Name -eq "Community") {
        $persistencePath = Join-Path $Directory.Path "KLSPL.Persistence"
        if (Test-Path $persistencePath) {
            $persistenceProject = Get-ChildItem -Path $persistencePath -Filter "*.csproj" | Select-Object -First 1
            if ($persistenceProject) {
                $persistenceProjects += $persistenceProject.FullName
            }
        }
        
        $commandDirs = Get-ChildItem -Path $Directory.Path -Directory | Where-Object { $_.Name -match "_Command$" }
        foreach ($cmdDir in $commandDirs) {
            $cmdProject = Get-ChildItem -Path $cmdDir.FullName -Filter "*.csproj" | Select-Object -First 1
            if ($cmdProject) {
                $commandProjects += $cmdProject.FullName
            }
        }
    } else {
        $persistenceDirs = Get-ChildItem -Path $Directory.Path -Directory | Where-Object { $_.Name -match "_Persistence$" }
        $commandDirs = Get-ChildItem -Path $Directory.Path -Directory | Where-Object { $_.Name -match "_Command$" }
        
        foreach ($persistenceDir in $persistenceDirs) {
            $persistenceProject = Get-ChildItem -Path $persistenceDir.FullName -Filter "*.csproj" | Select-Object -First 1
            if ($persistenceProject) {
                $persistenceProjects += $persistenceProject.FullName
            }
        }
        
        foreach ($commandDir in $commandDirs) {
            $commandProject = Get-ChildItem -Path $commandDir.FullName -Filter "*.csproj" | Select-Object -First 1
            if ($commandProject) {
                $commandProjects += $commandProject.FullName
            }
        }
    }
    
    # STEP 1: Find all packages used
    Write-ColorOutput "STEP 1: Finding all packages..." "Yellow"
    $allPackagesFound = @()
    
    foreach ($project in ($persistenceProjects + $commandProjects)) {
        $content = Get-Content $project -Raw -ErrorAction SilentlyContinue
        if (-not $content) { continue }
        
        $projectName = [System.IO.Path]::GetFileNameWithoutExtension($project)
        
        foreach ($packageName in $PackageMapping.Keys) {
            if ($content -match '<PackageReference\\s+Include="' + [regex]::Escape($packageName) + '"') {
                if ($allPackagesFound -notcontains $packageName) {
                    $allPackagesFound += $packageName
                    Write-ColorOutput "  Found package: $packageName in $projectName" "White"
                }
            }
        }
    }
    
    if ($allPackagesFound.Count -eq 0) {
        Write-ColorOutput "No packages found!" "Gray"
        return @()
    }
    
    # Get infrastructure projects
    $infraProjectsToLoad = @()
    foreach ($package in $allPackagesFound) {
        if ($PackageMapping.ContainsKey($package)) {
            $infraProject = $PackageMapping[$package]
            if ($infraProjectsToLoad -notcontains $infraProject) {
                $infraProjectsToLoad += $infraProject
                $projName = [System.IO.Path]::GetFileNameWithoutExtension($infraProject)
                Write-ColorOutput "  Will use: $projName" "Cyan"
            }
        }
    }
    
    # STEP 2: Add to solution
    Write-ColorOutput "\`nSTEP 2: Adding to solution..." "Yellow"
    if (Test-Path $Directory.SolutionPath) {
        foreach ($infraProject in $infraProjectsToLoad) {
            $solutionContent = Get-Content $Directory.SolutionPath -Raw -ErrorAction SilentlyContinue
            if (-not $solutionContent) { continue }
            
            $relativePath = Get-RelativePath -From (Split-Path $Directory.SolutionPath) -To $infraProject
            $projectName = [System.IO.Path]::GetFileNameWithoutExtension($infraProject)
            
            if (-not $solutionContent.Contains($projectName)) {
                Write-ColorOutput "  Adding to solution: $projectName" "Green"
                
                if (-not $WhatIf) {
                    $projectGuid = [System.Guid]::NewGuid().ToString().ToUpper()
                    $projectTypeGuid = "{FAE04EC0-301F-11D3-BF4B-00C04F79EFBC}"
                    $projectEntry = "Project(\`"$projectTypeGuid\`") = \`"$projectName\`", \`"$relativePath\`", \`"{$projectGuid}\`"\`r\`nEndProject"
                    
                    $lastProjectIndex = $solutionContent.LastIndexOf('EndProject')
                    if ($lastProjectIndex -ge 0) {
                        $insertPoint = $lastProjectIndex + 10
                        $solutionContent = $solutionContent.Insert($insertPoint, "\`r\`n$projectEntry")
                        $solutionContent | Out-File -FilePath $Directory.SolutionPath -Encoding UTF8 -NoNewline
                    }
                }
            } else {
                Write-ColorOutput "  Already in solution: $projectName" "Gray"
            }
        }
    }
    
    # STEP 3: Remove packages
    Write-ColorOutput "\`nSTEP 3: Removing package references..." "Yellow"
    foreach ($project in ($persistenceProjects + $commandProjects)) {
        $projectName = [System.IO.Path]::GetFileNameWithoutExtension($project)
        $content = Get-Content $project -Raw -ErrorAction SilentlyContinue
        if (-not $content) { continue }
        
        $modified = $false
        Write-ColorOutput "  Processing: $projectName" "White"
        
        foreach ($package in $allPackagesFound) {
            $pattern = '<PackageReference\\s+Include="' + [regex]::Escape($package) + '"[^>]*/?>'
            if ($content -match $pattern) {
                Write-ColorOutput "    Removing: $package" "Yellow"
                $content = $content -replace $pattern, ''
                $modified = $true
            }
        }
        
        if ($modified -and -not $WhatIf) {
            $content = $content -replace '(?m)^\\s*$(\`r?\`n)', ''
            $content = $content -replace '<ItemGroup>\\s*</ItemGroup>', ''
            $content | Out-File -FilePath $project -Encoding UTF8 -NoNewline
        }
    }
    
    # STEP 4: Add project references to Persistence
    Write-ColorOutput "\`nSTEP 4: Adding project references to Persistence..." "Yellow"
    foreach ($persistenceProject in $persistenceProjects) {
        $projectName = [System.IO.Path]::GetFileNameWithoutExtension($persistenceProject)
        Write-ColorOutput "  Processing Persistence: $projectName" "White"
        
        foreach ($infraProject in $infraProjectsToLoad) {
            Add-ProjectReference -ProjectPath $persistenceProject -ReferencePath $infraProject
        }
    }
    
    # STEP 5: Add Persistence reference to Command (for APIs only)
    if ($Directory.Name -ne "Community" -and $persistenceProjects.Count -gt 0 -and $commandProjects.Count -gt 0) {
        Write-ColorOutput "\`nSTEP 5: Adding Persistence reference to Command..." "Yellow"
        foreach ($commandProject in $commandProjects) {
            foreach ($persistenceProject in $persistenceProjects) {
                $commandName = [System.IO.Path]::GetFileNameWithoutExtension($commandProject)
                $persistenceName = [System.IO.Path]::GetFileNameWithoutExtension($persistenceProject)
                Write-ColorOutput "  Adding $persistenceName to $commandName" "White"
                Add-ProjectReference -ProjectPath $commandProject -ReferencePath $persistenceProject
            }
        }
    }
    
    return $infraProjectsToLoad
}

function Main {
    param([string]$Selection = "all")

    Write-ColorOutput "KLSPL Package Reference Replacement Tool" "White"
    Write-ColorOutput "========================================" "White"

    if ($WhatIf) {
        Write-ColorOutput "Mode: SIMULATION" "Yellow"
    } else {
        Write-ColorOutput "Mode: MAKING ACTUAL CHANGES" "Red"
    }

    # Get infrastructure projects
    $infraProjects = Get-InfrastructureProjects
    $packageMapping = Create-PackageMapping -InfraProjects $infraProjects

    # Get and select directories
    $allDirectories = Get-AllDirectories
    $selectedDirectories = Select-Directories -AllDirectories $allDirectories -Selection $Selection

    # Process each directory
    $allInfraProjects = @()
    foreach ($directory in $selectedDirectories) {
        $infraProjects = Process-Directory -Directory $directory -PackageMapping $packageMapping
        $allInfraProjects += $infraProjects
    }

    Write-ColorOutput "\`n=== COMPLETED ===" "Green"
    if ($WhatIf) {
        Write-ColorOutput "This was a simulation. Run without -WhatIf to apply changes." "Yellow"
    } else {
        Write-ColorOutput "All changes applied successfully!" "Green"
    }

    $uniqueInfraProjects = $allInfraProjects | Sort-Object -Unique
    Write-ColorOutput "\`nTotal infrastructure projects used: $($uniqueInfraProjects.Count)" "White"
    foreach ($proj in $uniqueInfraProjects) {
        $projName = [System.IO.Path]::GetFileNameWithoutExtension($proj)
        Write-ColorOutput "  - $projName" "Gray"
    }
}
`,

    validateStructure: `
param(
    [string]$ProjectsPath = "D:\\Projects",
    [string]$InfrastructurePath = "D:\\Projects\\KLSPL.Community.Common.Infrastructure"
)

function Write-ColorOutput {
    param([string]$Message, [string]$Color = "White")
    Write-Host $Message -ForegroundColor $Color
}

function Validate-Structure {
    Write-ColorOutput "Validating directory structure..." "White"
    Write-ColorOutput "==================================================" "White"
    
    # Check main projects directory
    if (Test-Path $ProjectsPath) {
        Write-ColorOutput "[OK] Projects directory exists: $ProjectsPath" "Green"
    } else {
        Write-ColorOutput "[ERROR] Projects directory not found: $ProjectsPath" "Red"
        return
    }
    
    # Check infrastructure directory
    if (Test-Path $InfrastructurePath) {
        Write-ColorOutput "[OK] Infrastructure directory exists: $InfrastructurePath" "Green"
    } else {
        Write-ColorOutput "[ERROR] Infrastructure directory not found: $InfrastructurePath" "Red"
        return
    }
    
    # Check Community directory
    $communityPath = Join-Path $ProjectsPath "Community"
    if (Test-Path $communityPath) {
        Write-ColorOutput "[OK] Community directory exists: $communityPath" "Green"
    } else {
        Write-ColorOutput "[WARNING] Community directory not found: $communityPath" "Red"
    }
    
    # List main API projects
    Write-ColorOutput "" "White"
    Write-ColorOutput "Main API Projects:" "Cyan"
    $apiDirs = Get-ChildItem -Path $ProjectsPath -Directory | Where-Object { $_.Name -match "\\.API$" -and $_.Name -notmatch "Community" }
    foreach ($dir in $apiDirs) {
        $solutionFile = Get-ChildItem -Path $dir.FullName -Filter "*.sln" | Select-Object -First 1
        if ($solutionFile) {
            Write-ColorOutput "  [OK] $($dir.Name) (has solution)" "Green"
        } else {
            Write-ColorOutput "  [WARNING] $($dir.Name) (no solution found)" "Yellow"
        }
    }
    
    # List infrastructure projects
    Write-ColorOutput "" "White"
    Write-ColorOutput "Infrastructure Projects:" "Cyan"
    $infraDirs = Get-ChildItem -Path $InfrastructurePath -Directory
    foreach ($dir in $infraDirs) {
        $projectFile = Get-ChildItem -Path $dir.FullName -Filter "*.csproj" | Select-Object -First 1
        if ($projectFile) {
            Write-ColorOutput "  [OK] $($dir.Name)" "Green"
        } else {
            Write-ColorOutput "  [WARNING] $($dir.Name) (no .csproj found)" "Yellow"
        }
    }
    
    # List Community projects
    if (Test-Path $communityPath) {
        Write-ColorOutput "" "White"
        Write-ColorOutput "Community Projects:" "Cyan"
        $communityDirs = Get-ChildItem -Path $communityPath -Directory
        foreach ($dir in $communityDirs) {
            $projectFile = Get-ChildItem -Path $dir.FullName -Filter "*.csproj" | Select-Object -First 1
            if ($projectFile) {
                Write-ColorOutput "  [OK] $($dir.Name)" "Green"
            } else {
                Write-ColorOutput "  [WARNING] $($dir.Name) (no .csproj found)" "Yellow"
            }
        }
    }
    
    Write-ColorOutput "" "White"
    Write-ColorOutput "Validation completed!" "White"
}

function Main {
    Validate-Structure
}
`
};

module.exports = POWERSHELL_SCRIPTS;