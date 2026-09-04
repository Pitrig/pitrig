find_package(Git REQUIRED)

function(_simcore_patch_stack_trial repo_root index_file touched direction patches result_variable)
    file(REMOVE "${index_file}")
    set(ENV{GIT_INDEX_FILE} "${index_file}")
    execute_process(
        COMMAND "${GIT_EXECUTABLE}" update-index --add -- ${touched}
        WORKING_DIRECTORY "${repo_root}"
        RESULT_VARIABLE seeded
        OUTPUT_QUIET
        ERROR_QUIET)
    set(ok TRUE)
    if(NOT seeded EQUAL 0)
        set(ok FALSE)
    endif()
    foreach(patch IN LISTS patches)
        if(ok)
            execute_process(
                COMMAND "${GIT_EXECUTABLE}" apply --cached ${direction} "${patch}"
                WORKING_DIRECTORY "${repo_root}"
                RESULT_VARIABLE applied
                OUTPUT_QUIET
                ERROR_QUIET)
            if(NOT applied EQUAL 0)
                set(ok FALSE)
            endif()
        endif()
    endforeach()
    unset(ENV{GIT_INDEX_FILE})
    file(REMOVE "${index_file}")
    set(${result_variable} ${ok} PARENT_SCOPE)
endfunction()

function(simcore_apply_patch_stack label component_dir)
    set(patches ${ARGN})
    get_filename_component(repo_root "${CMAKE_CURRENT_FUNCTION_LIST_DIR}/../.." ABSOLUTE)
    set(index_file "${CMAKE_BINARY_DIR}/simcore_patch_stack_index")
    set_property(DIRECTORY APPEND PROPERTY CMAKE_CONFIGURE_DEPENDS ${patches})

    set(touched "")
    foreach(patch IN LISTS patches)
        file(READ "${patch}" contents)
        string(REGEX MATCHALL "\n\\+\\+\\+ b/[^\n]+" headers "${contents}")
        foreach(header IN LISTS headers)
            string(REGEX REPLACE "^\n\\+\\+\\+ b/" "" path "${header}")
            list(APPEND touched "${path}")
        endforeach()
    endforeach()
    list(REMOVE_DUPLICATES touched)

    _simcore_patch_stack_trial("${repo_root}" "${index_file}" "${touched}" "" "${patches}" can_apply)
    if(can_apply)
        foreach(patch IN LISTS patches)
            get_filename_component(patch_name "${patch}" NAME)
            execute_process(
                COMMAND "${GIT_EXECUTABLE}" apply "${patch}"
                WORKING_DIRECTORY "${repo_root}"
                RESULT_VARIABLE applied
                OUTPUT_VARIABLE apply_output
                ERROR_VARIABLE apply_error)
            if(NOT applied EQUAL 0)
                message(FATAL_ERROR
                    "Failed to apply ${patch_name}:\n${apply_output}${apply_error}\n"
                    "Remove ${component_dir} and reconfigure.")
            endif()
            message(STATUS "Applied ${patch_name}")
        endforeach()
        return()
    endif()

    set(reversed ${patches})
    list(REVERSE reversed)
    _simcore_patch_stack_trial("${repo_root}" "${index_file}" "${touched}" "--reverse" "${reversed}" is_applied)
    if(NOT is_applied)
        message(FATAL_ERROR
            "${label} sources match neither the unpatched nor the patched state of the "
            "patch stack. Remove ${component_dir} and reconfigure, or review the patches.")
    endif()
    list(LENGTH patches count)
    message(STATUS "${label}: ${count} patches already applied")
endfunction()
