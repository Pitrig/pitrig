idf_component_register(
  SRCS "src/configuration_json.cpp"
       "src/json_readers.cpp"
       "src/json_value_pipeline.cpp"
       "src/json_widgets.cpp"
       "src/configuration_validation.cpp"
       "src/configuration_service.cpp"
  INCLUDE_DIRS "include"
  REQUIRES configuration_contract font_contract image_contract
  PRIV_REQUIRES binary cjson heap telemetry)

target_compile_options(${COMPONENT_LIB} PRIVATE -std=c++20)
