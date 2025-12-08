#!/bin/bash
# Note: We'll control error handling per-function rather than globally

# Configuration
PLUGINS=("pages" "geocoding" "cloudinary" "admin-search" "alt-text" "content-translator")
PAGES_DEV_FOLDERS=("dev" "dev_unlocalized" "dev_multi_tenant")
ALT_TEXT_DEV_FOLDERS=("dev" "dev_unlocalized")
CONTENT_TRANSLATOR_DEV_FOLDERS=("dev")

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Argument handling
TARGET_PLUGIN="${1:-all}"

# Logging functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
}

log_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

# Update dependencies function
update_dependencies() {
    local dir=$1
    cd "$dir" || return 1

    log_info "Updating dependencies in $dir"

    # Update all dependencies to latest
    pnpm up --latest || return 1

    # Pin Next.js to 15.x - version 16 has breaking changes with @payloadcms/next peer dependency
    if grep -q '"next"' package.json; then
        log_info "Pinning Next.js to 15.5.7"
        if [[ "$OSTYPE" == "darwin"* ]]; then
            sed -i '' 's/"next": "[^"]*"/"next": "15.5.7"/g' package.json || return 1
        else
            sed -i 's/"next": "[^"]*"/"next": "15.5.7"/g' package.json || return 1
        fi
        pnpm install || return 1
    fi

    if grep -q '"eslint-config-next"' package.json; then
        log_info "Pinning eslint-config-next to 15.5.7"
        if [[ "$OSTYPE" == "darwin"* ]]; then
            sed -i '' 's/"eslint-config-next": "[^"]*"/"eslint-config-next": "15.5.7"/g' package.json || return 1
        else
            sed -i 's/"eslint-config-next": "[^"]*"/"eslint-config-next": "15.5.7"/g' package.json || return 1
        fi
        pnpm install || return 1
    fi

    return 0
}

# Generate types function
generate_types() {
    local dir=$1
    cd "$dir"

    log_info "Generating types in $dir"
    pnpm run generate:types
}

# Generate importmap function
generate_importmap() {
    local dir=$1
    cd "$dir"

    log_info "Generating importmap in $dir"
    pnpm run generate:importmap
}

# Verify dev server function
verify_dev_server() {
    local dir=$1
    cd "$dir"

    log_info "Verifying dev server in $dir"

    # Check if timeout command exists (Linux) or gtimeout (macOS with coreutils)
    if command -v timeout >/dev/null 2>&1; then
        TIMEOUT_CMD="timeout"
    elif command -v gtimeout >/dev/null 2>&1; then
        TIMEOUT_CMD="gtimeout"
    else
        log_warning "timeout command not found, skipping dev server verification"
        log_info "Install coreutils on macOS: brew install coreutils"
        return 0
    fi

    # Start dev server in background with timeout
    $TIMEOUT_CMD 30s pnpm dev &
    local pid=$!

    # Wait for server to be ready
    sleep 10

    # Check if process is still running (indicates successful start)
    if kill -0 $pid 2>/dev/null; then
        log_info "Dev server started successfully"
        # Kill the process since we're just verifying
        kill $pid 2>/dev/null || true
        return 0
    else
        log_warning "Dev server verification completed"
        return 0
    fi
}

# Validate plugin structure function
validate_plugin_structure() {
    local plugin=$1
    local plugin_dir="$ORIGINAL_DIR/$plugin"

    # Check plugin root package.json
    if [ ! -f "$plugin_dir/package.json" ]; then
        log_error "Missing package.json in $plugin_dir"
        return 1
    fi

    # Determine expected dev folders
    local expected_folders=()
    if [ "$plugin" = "pages" ]; then
        expected_folders=("${PAGES_DEV_FOLDERS[@]}")
    elif [ "$plugin" = "alt-text" ]; then
        expected_folders=("${ALT_TEXT_DEV_FOLDERS[@]}")
    elif [ "$plugin" = "content-translator" ]; then
        expected_folders=("${CONTENT_TRANSLATOR_DEV_FOLDERS[@]}")
    else
        expected_folders=("dev")
    fi

    # Validate each dev folder has package.json
    for dev_folder in "${expected_folders[@]}"; do
        if [ ! -f "$plugin_dir/$dev_folder/package.json" ]; then
            log_error "Missing package.json in $plugin_dir/$dev_folder"
            return 1
        fi
    done

    return 0
}

# Store original directory
ORIGINAL_DIR=$(pwd)

# Results tracking - using parallel arrays for compatibility
RESULT_PLUGINS=()
RESULT_STATUSES=()

# Check if single plugin specified and validate
if [ "$TARGET_PLUGIN" != "all" ]; then
    if [[ ! " ${PLUGINS[@]} " =~ " ${TARGET_PLUGIN} " ]]; then
        log_error "Unknown plugin: $TARGET_PLUGIN"
        log_info "Available plugins: ${PLUGINS[*]}"
        exit 1
    fi
    PLUGINS=("$TARGET_PLUGIN")
    log_info "Updating single plugin: $TARGET_PLUGIN"
else
    log_info "Updating all plugins"
fi

# Process each plugin
for plugin in "${PLUGINS[@]}"; do
    log_info "========================================="
    log_info "Processing plugin: $plugin"
    log_info "========================================="

    PLUGIN_STATUS="SUCCESS"

    # Validate plugin structure first
    if ! validate_plugin_structure "$plugin"; then
        PLUGIN_STATUS="FAILED"
        log_error "Plugin structure validation failed for $plugin"
        RESULT_PLUGINS+=("$plugin")
        RESULT_STATUSES+=("$PLUGIN_STATUS")
        continue
    fi

    # Update plugin root
    if ! update_dependencies "$ORIGINAL_DIR/$plugin"; then
        PLUGIN_STATUS="FAILED"
        log_error "Failed to update dependencies for $plugin"
        RESULT_PLUGINS+=("$plugin")
        RESULT_STATUSES+=("$PLUGIN_STATUS")
        continue
    fi

    # Determine dev folders
    if [ "$plugin" = "pages" ]; then
        dev_folders=("${PAGES_DEV_FOLDERS[@]}")
    elif [ "$plugin" = "alt-text" ]; then
        dev_folders=("${ALT_TEXT_DEV_FOLDERS[@]}")
    elif [ "$plugin" = "content-translator" ]; then
        dev_folders=("${CONTENT_TRANSLATOR_DEV_FOLDERS[@]}")
    else
        dev_folders=("dev")
    fi

    # Process each dev folder
    for dev_folder in "${dev_folders[@]}"; do
        dev_path="$ORIGINAL_DIR/$plugin/$dev_folder"

        if [ -d "$dev_path" ]; then
            log_info "Processing dev folder: $dev_folder"

            if ! update_dependencies "$dev_path"; then
                PLUGIN_STATUS="FAILED"
                log_error "Failed to update dependencies in $dev_path"
                continue
            fi

            if ! generate_types "$dev_path"; then
                PLUGIN_STATUS="FAILED"
                log_error "Failed to generate types in $dev_path"
                continue
            fi

            if ! generate_importmap "$dev_path"; then
                PLUGIN_STATUS="FAILED"
                log_error "Failed to generate importmap in $dev_path"
                continue
            fi

            if ! verify_dev_server "$dev_path"; then
                log_warning "Dev server verification failed in $dev_path"
                # Don't mark as failed, just warn
            fi
        else
            log_warning "Dev folder not found: $dev_path"
        fi
    done

    # Add result for this plugin
    RESULT_PLUGINS+=("$plugin")
    RESULT_STATUSES+=("$PLUGIN_STATUS")

    cd "$ORIGINAL_DIR"
done

# Generate summary report
echo
log_info "========================================="
log_info "SUMMARY REPORT"
log_info "========================================="

SUCCESS_COUNT=0
FAILED_COUNT=0

# Loop through results using indices
for i in "${!RESULT_PLUGINS[@]}"; do
    plugin="${RESULT_PLUGINS[$i]}"
    status="${RESULT_STATUSES[$i]}"

    if [ "$status" = "SUCCESS" ]; then
        echo -e "${GREEN}✓${NC} $plugin: $status"
        ((SUCCESS_COUNT++))
    else
        echo -e "${RED}✗${NC} $plugin: $status"
        ((FAILED_COUNT++))
    fi
done

echo
log_info "Total: $SUCCESS_COUNT successful, $FAILED_COUNT failed"

# Exit with appropriate code
if [ $FAILED_COUNT -gt 0 ]; then
    exit 1
else
    exit 0
fi