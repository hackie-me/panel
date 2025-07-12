param(
    [string]$ProjectsPath = "D:\Projects",
    [string]$InfrastructurePath = "D:\Projects\KLSPL.Community.Common.Infrastructure"
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
    $apiDirs = Get-ChildItem -Path $ProjectsPath -Directory | Where-Object { $_.Name -match "\.API$" -and $_.Name -notmatch "Community" }
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

# Run the validation
Validate-Structure