# Sourced, never executed:  . tools/idf-env.sh [build-directory]
#
# Puts an ESP-IDF environment into the current shell, using the Python
# interpreter the named build directory was configured with.
#
# export.sh chooses a virtualenv on its own, and an installation can carry more
# than one — the installer's own, and the one a build directory was configured
# with. When the two differ idf.py refuses to build and suggests `idf.py
# fullclean`, which throws the build away rather than resolving the mismatch.
# A build directory that does not exist yet has no opinion, so whatever
# export.sh picks becomes its record and the two agree from then on.

if [ -z "${IDF_PATH:-}" ]; then
  for _simcore_idf in "$HOME"/.espressif/v*/esp-idf "$HOME"/esp/esp-idf; do
    if [ -f "$_simcore_idf/export.sh" ]; then
      IDF_PATH="$_simcore_idf"
    fi
  done
  unset _simcore_idf
fi

if [ ! -f "${IDF_PATH:-}/export.sh" ]; then
  echo "idf-env.sh: no ESP-IDF found. Set IDF_PATH, or install one under ~/.espressif." >&2
  return 1 2>/dev/null || exit 1
fi
export IDF_PATH

# An explicit choice by the caller wins; otherwise the build directory's own
# record decides, which is the only value that cannot be the wrong one.
if [ -z "${IDF_PYTHON_ENV_PATH:-}" ] && [ -f "${1:-}/CMakeCache.txt" ]; then
  _simcore_python=$(sed -n 's/^PYTHON:UNINITIALIZED=//p' "$1/CMakeCache.txt" | head -1)
  if [ -x "$_simcore_python" ]; then
    IDF_PYTHON_ENV_PATH=$(dirname "$(dirname "$_simcore_python")")
    export IDF_PYTHON_ENV_PATH
  fi
  unset _simcore_python
fi

. "$IDF_PATH/export.sh"
