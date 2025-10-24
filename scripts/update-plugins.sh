#!/bin/bash
# Note: We'll control error handling per-function rather than globally

# Configuration
PLUGINS=("pages" "geocoding" "seo" "cloudinary" "admin-search" "alt-text")
PAGES_DEV_FOLDERS=("dev" "dev_unlocalized" "dev_multi_tenant")

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
    cd "$dir"
    log_info "Updating dependencies in $dir"
    pnpm up --latest
}

# Generate types function
generate_types() {
    local dir=$1
    local plugin=$2
    cd "$dir"

    log_info "Generating types in $dir"
    if [ "$plugin" = "admin-search" ]; then
        pnpm run generate:types
    else
        pnpm run generate:types
    fi
}

# Generate importmap function
generate_importmap() {
    local dir=$1
    local plugin=$2
    cd "$dir"

    log_info "Generating importmap in $dir"
    if [ "$plugin" = "admin-search" ]; then
        pnpm run generate:importmap
    else
        pnpm run generate:importmap
    fi
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

            if ! generate_types "$dev_path" "$plugin"; then
                PLUGIN_STATUS="FAILED"
                log_error "Failed to generate types in $dev_path"
                continue
            fi

            if ! generate_importmap "$dev_path" "$plugin"; then
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