if [ -z "${IDF_PATH:-}" ]; then
  for _pitrig_idf in "$HOME"/.espressif/v*/esp-idf "$HOME"/esp/esp-idf; do
    if [ -f "$_pitrig_idf/export.sh" ]; then
      IDF_PATH="$_pitrig_idf"
    fi
  done
  unset _pitrig_idf
fi

if [ ! -f "${IDF_PATH:-}/export.sh" ]; then
  echo "idf-env.sh: no ESP-IDF found. Set IDF_PATH, or install one under ~/.espressif." >&2
  return 1 2>/dev/null || exit 1
fi
export IDF_PATH

if [ -n "${1:-}" ] && [ ! -f "$1/CMakeCache.txt" ] && [ -f "firmware/$1/CMakeCache.txt" ]; then
  echo "idf-env.sh: '$1' has no CMakeCache.txt here, but 'firmware/$1' does." >&2
  echo "  The build directory is read as a path from the current directory." >&2
  echo "  Use:  source tools/idf-env.sh firmware/$1" >&2
  echo "  or:   cd firmware && source ../tools/idf-env.sh $1" >&2
  echo "  Continuing would pick the default virtualenv, which that build directory" >&2
  echo "  may not have been configured with." >&2
  return 1 2>/dev/null || exit 1
fi

if [ -z "${IDF_PYTHON_ENV_PATH:-}" ] && [ -f "${1:-}/CMakeCache.txt" ]; then
  _pitrig_python=$(sed -n 's/^PYTHON:UNINITIALIZED=//p' "$1/CMakeCache.txt" | head -1)
  if [ -x "$_pitrig_python" ]; then
    IDF_PYTHON_ENV_PATH=$(dirname "$(dirname "$_pitrig_python")")
    export IDF_PYTHON_ENV_PATH
  fi
  unset _pitrig_python
fi

. "$IDF_PATH/export.sh"
