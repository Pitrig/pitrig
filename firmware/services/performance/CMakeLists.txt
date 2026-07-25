set(component_sources)

if(SIMCORE_DEBUG)
  list(APPEND component_sources "src/performance.cpp")
endif()

idf_component_register(SRCS ${component_sources}
                       INCLUDE_DIRS "include"
                       REQUIRES esp_timer freertos heap logger)

if(SIMCORE_DEBUG)
  target_compile_options(${COMPONENT_LIB} PRIVATE -std=c++20)
endif()
