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

if [ -z "${IDF_PYTHON_ENV_PATH:-}" ] && [ -f "${1:-}/CMakeCache.txt" ]; then
  _simcore_python=$(sed -n 's/^PYTHON:UNINITIALIZED=//p' "$1/CMakeCache.txt" | head -1)
  if [ -x "$_simcore_python" ]; then
    IDF_PYTHON_ENV_PATH=$(dirname "$(dirname "$_simcore_python")")
    export IDF_PYTHON_ENV_PATH
  fi
  unset _simcore_python
fi

. "$IDF_PATH/export.sh"
